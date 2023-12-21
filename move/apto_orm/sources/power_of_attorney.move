module apto_orm::power_of_attorney {
    use std::signer;
    use std::error;
    use aptos_framework::account;
    use aptos_framework::chain_id;
    use aptos_framework::timestamp;
    use aptos_framework::aptos_account;
    use aptos_framework::object::{Self, Object};

    use apto_orm::proof_challenge;

    const ENOT_SIGNER_OBJECT: u64 = 1;
    const ENOT_AUTHORIZED_OWNER: u64 = 2;
    const EDELEGATION_EXPIRED: u64 = 3;
    const EPOWER_OF_ATTORNEY_PAUSED: u64 = 4;

    /// The authorized account on behalf of original owner must have the PowerOfAttorney resource.
    struct PowerOfAttorney has key, drop {
        designator: address,
        expiration_date: u64,
    }

    /// The proof challenge to become the authorized account on behalf of original owner.
    struct PowerOfAttorneyProof has drop {
        chain_id: u8,
        delegator_address: address,
        delegator_sequence_number: u64,
        designator: address,
        expiration_date: u64,
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    /// PowerOfAttorneyPaused pauses all power of attorney.
    struct PowerOfAttorneyPaused has key, drop {}

    public fun check_paused(object_or_account: address) {
        if (exists<PowerOfAttorneyPaused>(object_or_account)) {
            abort error::permission_denied(EPOWER_OF_ATTORNEY_PAUSED)
        };
    }

    public fun check_authorized<T: key>(
        object: &Object<T>, maybe_owner: address
    ) acquires PowerOfAttorney {
        if (exists<PowerOfAttorney>(maybe_owner)) {
            check_paused(object::object_address(object));
            let poa = borrow_global<PowerOfAttorney>(maybe_owner);
            assert!(
                object::owner(*object) == poa.designator,
                error::permission_denied(ENOT_AUTHORIZED_OWNER),
            );
            assert!(
                poa.expiration_date == 0 ||
                poa.expiration_date >= timestamp::now_seconds(),
                error::invalid_state(EDELEGATION_EXPIRED)
            );
        } else {
            assert!(
                object::owner(*object) == maybe_owner,
                error::permission_denied(ENOT_AUTHORIZED_OWNER),
            );
        };
    }

    public fun is_authorized<T: key>(
        object: &Object<T>, maybe_owner: address
    ): bool acquires PowerOfAttorney {
        if (exists<PowerOfAttorney>(maybe_owner)) {
            let poa = borrow_global<PowerOfAttorney>(maybe_owner);
            if (object::owner(*object) != poa.designator) return false;
            if (exists<PowerOfAttorneyPaused>(poa.designator)) return false;
            if (poa.expiration_date != 0 && poa.expiration_date < timestamp::now_seconds()) return false;
        } else {
            if (object::owner(*object) != maybe_owner) return false;
        };
        true
    }

    /// Initialize SignerObject with both the designator and the delegator accounts
    entry fun init_poa(
        delegator: &signer,
        expiration_date: u64,
        designator: address,
        designator_account_scheme: u8,
        designator_account_public_key_bytes: vector<u8>,
        designator_signed_proof_challenge: vector<u8>,
    ) {
        let delegator_address = signer::address_of(delegator);
        let delegator_sequence_number = account::get_sequence_number(delegator_address);
        move_to(delegator, PowerOfAttorney {
            designator: designator,
            expiration_date: expiration_date,
        });
        proof_challenge::verify<PowerOfAttorneyProof>(
            delegator,
            PowerOfAttorneyProof {
                chain_id: chain_id::get(),
                delegator_address,
                delegator_sequence_number,
                designator: designator,
                expiration_date,
            },
            designator,
            designator_account_scheme,
            designator_account_public_key_bytes,
            designator_signed_proof_challenge,
            true,
        );
    }

    /// Register new delegator with both the designator and the delegator signatures
    public entry fun register_poa(
        designator: &signer,
        delegator: &signer,
        expiration_date: u64,
        amount: u64,
    ) {
        let designator_address = signer::address_of(designator);
        let delegator_address = signer::address_of(delegator);
        aptos_account::transfer(designator, delegator_address, amount);
        move_to(delegator, PowerOfAttorney {
            designator: designator_address,
            expiration_date: expiration_date,
        });
        proof_challenge::verify_directly<PowerOfAttorneyProof>(designator, delegator);
    }

    /// The designator of the SignerObject can revoke the PowerOfAttorney
    entry fun revoke_poa(
        designator: &signer,
        delegator: address,
    ) acquires PowerOfAttorney {
        let designator_address = signer::address_of(designator);
        proof_challenge::revoke<PowerOfAttorneyProof>(designator, delegator);
        if (exists<PowerOfAttorney>(delegator)) {
            let poa = move_from<PowerOfAttorney>(delegator);
            assert!(
                poa.designator == designator_address,
                error::permission_denied(ENOT_AUTHORIZED_OWNER),
            );
        };
    }

    public entry fun pause(designator: &signer) {
        let designator_address = signer::address_of(designator);
        if (!exists<PowerOfAttorneyPaused>(designator_address)) {
            move_to(designator, PowerOfAttorneyPaused {});
        };
    }

    public entry fun resume(designator: &signer) acquires PowerOfAttorneyPaused {
        let designator_address = signer::address_of(designator);
        if (exists<PowerOfAttorneyPaused>(designator_address)) {
            move_from<PowerOfAttorneyPaused>(designator_address);
        };
    }

    #[test(aptos = @0x1, user1 = @0x456)]
    public entry fun test_power_of_attorney(aptos: &signer, user1: &signer) acquires PowerOfAttorney {
        use aptos_std::ed25519;
        use apto_orm::test_utilities;
        // use aptos_std::debug;
        // debug::print<String>(&msg);

        test_utilities::init_network(aptos, 10);
        let user1_address = signer::address_of(user1);
        test_utilities::create_and_fund_account(user1_address, 100);
        let user1_sequence_number = account::get_sequence_number(user1_address);

        let (designator, designator_sk, designator_pk_bytes) = test_utilities::create_account_and_keypair();
        let designator_address = signer::address_of(&designator);
        let proof = PowerOfAttorneyProof {
            chain_id: chain_id::get(),
            delegator_address: user1_address,
            delegator_sequence_number: user1_sequence_number,
            designator: designator_address,
            expiration_date: 100,
        };
        let signature = ed25519::sign_struct(&designator_sk, proof);
        let designator_account_scheme = 0;
        init_poa(
            user1,
            100,
            designator_address,
            designator_account_scheme,
            designator_pk_bytes,
            ed25519::signature_to_bytes(&signature),
        );

        assert!(proof_challenge::is_proven<PowerOfAttorneyProof>(user1_address, designator_address), 1);
        revoke_poa(&designator, user1_address);
        assert!(!proof_challenge::is_proven<PowerOfAttorneyProof>(user1_address, designator_address), 1);
        register_poa(&designator, user1, 100, 0);
    }
}
