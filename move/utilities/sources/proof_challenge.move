module apto_orm::proof_challenge {
    use std::error;
    use std::signer;
    use aptos_std::ed25519;
    use aptos_std::multi_ed25519;
    use aptos_framework::account;

    const EINVALID_ISSUER_PUBLIC_KEY: u64 = 1;
    const EINVALID_PROOF_CHALLENGE_SIGNATURE: u64 = 2;
    const EINVALID_PROOF_CHALLENGE_SCHEME: u64 = 3;
    const EINVALID_ISSUER: u64 = 4;

    /// Proven is used to store the proof challenge type submitted to the onchain
    /// and the issuer who has issued the proof challenge.
    struct Proven<phantom ProofChallenge> has key, drop {
        by: address,
    }

    /// verify the proof challenge and record the proof challenge onchain
    public fun verify<ProofChallenge: drop>(
        submitter: &signer,
        proof_challenge: ProofChallenge,
        issuer: address,
        issuer_account_scheme: u8,
        issuer_public_key_bytes: vector<u8>,
        issuer_signed_proof_challenge: vector<u8>,
        must_be_recorded: bool,
    ) acquires Proven {
        let issuer_authentication_key = account::get_authentication_key(issuer);
        // verify the signature
        // 0: ED25519_SCHEME, 1: MULTI_ED25519_SCHEME
        if (issuer_account_scheme == 0) {
            let pubkey = ed25519::new_unvalidated_public_key_from_bytes(issuer_public_key_bytes);
            let expected_auth_key = ed25519::unvalidated_public_key_to_authentication_key(&pubkey);
            assert!(issuer_authentication_key == expected_auth_key, error::invalid_argument(EINVALID_ISSUER_PUBLIC_KEY));

            let signature = ed25519::new_signature_from_bytes(issuer_signed_proof_challenge);
            assert!(
                ed25519::signature_verify_strict_t(&signature, &pubkey, proof_challenge),
                error::invalid_argument(EINVALID_PROOF_CHALLENGE_SIGNATURE)
            );
        } else if (issuer_account_scheme == 1) {
            let pubkey = multi_ed25519::new_unvalidated_public_key_from_bytes(issuer_public_key_bytes);
            let expected_auth_key = multi_ed25519::unvalidated_public_key_to_authentication_key(&pubkey);
            assert!(issuer_authentication_key == expected_auth_key, error::invalid_argument(EINVALID_ISSUER_PUBLIC_KEY));

            let signature = multi_ed25519::new_signature_from_bytes(issuer_signed_proof_challenge);
            assert!(
                multi_ed25519::signature_verify_strict_t(&signature, &pubkey, proof_challenge),
                error::invalid_argument(EINVALID_PROOF_CHALLENGE_SIGNATURE)
            );
        } else {
            abort error::invalid_argument(EINVALID_PROOF_CHALLENGE_SCHEME)
        };
        if (!must_be_recorded) {
            return
        };
        let submitter_address = signer::address_of(submitter);
        if (exists<Proven<ProofChallenge>>(submitter_address)) {
            let proven = borrow_global_mut<Proven<ProofChallenge>>(submitter_address);
            proven.by = issuer;
        } else {
            move_to(submitter, Proven<ProofChallenge> { by: issuer });
        };
    }

    /// only record the proven status of the target (submitter) onchain directly
    public fun verify_directly<ProofChallenge: drop>(issuer: &signer, target: &signer) acquires Proven {
        let issuer_address = signer::address_of(issuer);
        let submitter_address = signer::address_of(target);
        if (exists<Proven<ProofChallenge>>(submitter_address)) {
            let proven = borrow_global_mut<Proven<ProofChallenge>>(submitter_address);
            proven.by = issuer_address;
        } else {
            move_to(target, Proven<ProofChallenge> { by: issuer_address });
        };
    }

    public fun revoke<ProofChallenge: drop>(issuer: &signer, target: address) acquires Proven {
        let issuer_address = signer::address_of(issuer);
        assert!(
            issuer_address == borrow_global<Proven<ProofChallenge>>(target).by,
            error::invalid_argument(EINVALID_ISSUER)
        );
        if (exists<Proven<ProofChallenge>>(target)) {
            move_from<Proven<ProofChallenge>>(target);
        };
    }

    /// check whether the target (submitter) has been proven by the issuer
    public fun is_proven<ProofChallenge: drop>(target: address, issuer: address): bool acquires Proven {
        if (exists<Proven<ProofChallenge>>(target)) {
            let proven = borrow_global<Proven<ProofChallenge>>(target);
            return proven.by == issuer
        };
        false
    }

    #[test_only]
    struct TestProofChallenge has drop {
        user: address,
        in_data: u64,
    }

    #[test_only]
    public fun generate_proof_challenge<ProofChallenge: drop>(
        proof_challenge: ProofChallenge,
        secret_key: &ed25519::SecretKey,
    ): ed25519::Signature {
        let signature = ed25519::sign_struct(secret_key, proof_challenge);
        signature
    }

    #[test(aptos = @0x1, user1 = @0x123, user2 = @0x456)]
    public entry fun test_proof_challenge(aptos: &signer, user1: &signer, user2: &signer) acquires Proven {
        use aptos_framework::account::create_account_for_test;
        use apto_orm::test_utilities;
        test_utilities::init_network(aptos, 10);

        let (issuer, issuer_sk, issuer_pk_bytes) = test_utilities::create_account_and_keypair();
        let issuer_address = signer::address_of(&issuer);
        let user1_address = signer::address_of(user1);
        let user2_address = signer::address_of(user2);
        create_account_for_test(user1_address);
        create_account_for_test(user2_address);
        let issuer_signed_proof_challenge = generate_proof_challenge<TestProofChallenge>(
            TestProofChallenge {
                user: user1_address,
                in_data: 123
            },
            &issuer_sk
        );
        let issuer_account_scheme = 0;
        verify<TestProofChallenge>(
            user1,
            TestProofChallenge {
                user: user1_address,
                in_data: 123
            },
            issuer_address,
            issuer_account_scheme,
            issuer_pk_bytes,
            ed25519::signature_to_bytes(&issuer_signed_proof_challenge),
            true,
        );
        assert!(is_proven<TestProofChallenge>(user1_address, issuer_address), 1);
        verify_directly<TestProofChallenge>(
            &issuer,
            user2,
        );
        assert!(is_proven<TestProofChallenge>(user2_address, issuer_address), 1);
    }
}
