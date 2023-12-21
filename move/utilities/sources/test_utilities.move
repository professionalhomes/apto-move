#[test_only]
module apto_orm::test_utilities {
    // use std::error;
    use std::signer;
    // use std::string::{Self, String};
    use aptos_std::ed25519;
    // use aptos_std::multi_ed25519;
    use aptos_framework::account;
    // use aptos_framework::chain_id;
    // use aptos_framework::object::{Self, Object, ConstructorRef};
    use aptos_framework::coin::{Self, BurnCapability, MintCapability};
    use aptos_framework::aptos_coin::{Self, AptosCoin};
    use aptos_framework::aptos_account;

    struct CapStore has key {
        burn_cap: BurnCapability<AptosCoin>,
        mint_cap: MintCapability<AptosCoin>,
    }

    public fun init_network(aptos: &signer, now: u64) {
        use aptos_framework::timestamp;
        use aptos_framework::chain_id;
        use std::features;

        // enable auids_enabled, APTOS_UNIQUE_IDENTIFIERS
        features::change_feature_flags(aptos, vector[23], vector[]);

        assert!(signer::address_of(aptos) == @0x1, 1);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos);
        move_to(aptos, CapStore {
            burn_cap: burn_cap,
            mint_cap: mint_cap,
        });
        chain_id::initialize_for_test(aptos, 1);
        timestamp::set_time_has_started_for_testing(aptos);
        timestamp::update_global_time_for_test_secs(now);
    }

    public fun set_network_time(now: u64) {
        use aptos_framework::timestamp;
        timestamp::update_global_time_for_test_secs(now);
    }
    
    public fun create_account_and_keypair(): (signer, ed25519::SecretKey, vector<u8>) acquires CapStore {
        let (sk, pk) = ed25519::generate_keys();
        let pk_bytes = ed25519::validated_public_key_to_bytes(&pk);
        let account = account::create_account_from_ed25519_public_key(pk_bytes);
        fund(signer::address_of(&account), 0);
        (account, sk, pk_bytes)
    }

    public fun fund(user: address, amount: u64) acquires CapStore {
        let cap_store = borrow_global<CapStore>(@0x1);
        let coins_minted = coin::mint<AptosCoin>(amount, &cap_store.mint_cap);
        aptos_account::deposit_coins(user, coins_minted);
    }

    public fun create_and_fund_account(account: address, amount: u64) acquires CapStore {
        account::create_account_for_test(account);
        fund(account, amount);
    }
}
