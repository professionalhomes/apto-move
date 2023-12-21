/// This module is for preventing double spending of the proof challenge or whitelist minting.
/// The ChallengeLog resource is stored in the account of the user who requested the proof challenge.
/// And the ChallengeLog resource is used to check whether the proof challenge has already been used.
module apto_orm::challenge_log {
    use std::error;
    use std::signer;
    use std::string::{Self, String};
    use aptos_std::smart_table::{Self, SmartTable};

    use aptos_framework::account;
    // use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::event::{EventHandle};

    const ECHALLENGE_LOG_NOT_FOUND: u64 = 1;
    const ECHALLENGE_ALREADY_USED: u64 = 2;

    const CHALLENGE_REGISTERED: vector<u8> = b"registered";

    struct ChallengeLogEvent has drop, store {
        event_type: String,
        challenge: vector<u8>,
        reference: address,
        reserved: String,
    }

    struct ChallengeData has store, drop, copy {
        reference: address,
        reserved: String,
    }

    struct ChallengeLog has key {
        challenges: SmartTable<vector<u8>, ChallengeData>,
        events: EventHandle<ChallengeLogEvent>,
    }

    /// Initialize ChallengeLog resource to prevent double spending
    /// of the proof challenge or whitelist minting.
    public entry fun init(user: &signer) {
        let challenges = smart_table::new<vector<u8>, ChallengeData>();
        let events = account::new_event_handle<ChallengeLogEvent>(user);
        move_to<ChallengeLog>(user, ChallengeLog {
            challenges, events
        })
    }

    public fun set(
        user: &signer, challenge: vector<u8>, reference: address,
    ) acquires ChallengeLog {
        let user_address = signer::address_of(user);
        assert!(
            exists<ChallengeLog>(user_address),
            error::not_found(ECHALLENGE_LOG_NOT_FOUND)
        );
        let log = borrow_global_mut<ChallengeLog>(user_address);
         assert!(
            !smart_table::contains(&log.challenges, challenge),
            error::not_found(ECHALLENGE_ALREADY_USED)
        );
        smart_table::add<vector<u8>, ChallengeData>(
            &mut log.challenges, challenge,
            ChallengeData { reference, reserved: string::utf8(b"") },
        );

        // // [FIXME] It will be added if Aptos aggregator solution is done for parallelization.
        // event::emit_event<ChallengeLogEvent>(
        //     &mut log.events,
        //     ChallengeLogEvent {
        //         event_type: string::utf8(CHALLENGE_REGISTERED),
        //         challenge, reference, reserved: string::utf8(b""),
        //     },
        // );
    }

    public fun init_and_set(
        user: &signer, challenge: vector<u8>, reference: address,
    ) acquires ChallengeLog {
        let user_address = signer::address_of(user);
        if (!initialized(user_address)) {
            init(user);
        };
        set(user, challenge, reference);
    }

    #[view]
    public fun initialized(user: address): bool {
        exists<ChallengeLog>(user)
    }

    #[view]
    public fun recorded(
        user: address, challenge: vector<u8>,
    ): bool acquires ChallengeLog {
        if (!exists<ChallengeLog>(user)) return false;
        let log = borrow_global<ChallengeLog>(user);
        smart_table::contains(&log.challenges, challenge)
    }
}
