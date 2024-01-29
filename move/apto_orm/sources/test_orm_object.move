#[test_only]
module apto_orm::test_orm_object {
    use apto_orm::test_utilities;
    use apto_orm::power_of_attorney;
    use apto_orm::orm_class;
    use apto_orm::orm_creator;
    use apto_orm::orm_module;
    use apto_orm::orm_object;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::timestamp;
    use std::error;
    use std::signer;
    use std::string;


    const CLASS_NAME: vector<u8> = b"Board";
    const EBOARD_OBJECT_NOT_FOUND: u64 = 1;
    const ENOT_BOARD_OBJECT: u64 = 2;

    struct Board has key, copy, drop {
        title: string::String,
        content: string::String,
        updated_at: u64,
        like: u32,
    }

    fun init_module(package: &signer) {
        let class_signer = orm_class::create_class_as_object<Board>(
            package,
            string::utf8(CLASS_NAME),
            true, true, true, true, false, true, false
        );
        orm_module::set<Board>(
            package,
            signer::address_of(package),
            signer::address_of(&class_signer),
        );
    }

    public fun create(
        user: &signer,
        package: address,
        title: string::String,
        content: string::String,
        like: u32,
    ): Object<Board>{
        let (orm_creator, orm_class) = orm_module::get<Board>(package);
        let creator_signer = orm_creator::load_creator(user, orm_creator);
        let creator_address = signer::address_of(&creator_signer);
        let ref = object::create_object(creator_address);
        let object_signer = orm_object::init<Board>(&creator_signer, &ref, orm_class);
        let updated_at = timestamp::now_seconds();
        move_to<Board>(&object_signer, Board {
            title: title, content: content, updated_at: updated_at, like: like
        });
        object::object_from_constructor_ref<Board>(&ref)
    }

    public fun create_to(
        user: &signer,
        package: address,
        title: string::String,
        content: string::String,
        like: u32,
        to: address,
    ): Object<Board>{
        let (orm_creator, orm_class) = orm_module::get<Board>(package);
        let creator_signer = orm_creator::load_creator(user, orm_creator);
        let creator_address = signer::address_of(&creator_signer);
        let ref = object::create_object(creator_address);
        let object_signer = orm_object::init<Board>(&creator_signer, &ref, orm_class);
        let updated_at = timestamp::now_seconds();
        move_to<Board>(&object_signer, Board {
            title: title, content: content, updated_at: updated_at, like: like
        });
        orm_object::transfer_initially(&ref, to);
        object::object_from_constructor_ref<Board>(&ref)
    }

    public fun update<T: key>(
        user: &signer,
        object: Object<T>,
        title: string::String,
        content: string::String,
        like: u32,
    ) acquires Board {
        let object_address = object::object_address(&object);
        assert!(
            exists<Board>(object_address),
            error::invalid_argument(ENOT_BOARD_OBJECT),
        );
        orm_object::load_signer(user, object);
        let user_data = borrow_global_mut<Board>(object_address);
        user_data.title = title;
        user_data.content = content;
        user_data.updated_at = timestamp::now_seconds();
        user_data.like = like;
    }

    public fun delete<T: key>(
        user: &signer,
        object: Object<T>,
    ) acquires Board {
        let object_address = object::object_address(&object);
        assert!(
          exists<Board>(object_address),
          error::invalid_argument(ENOT_BOARD_OBJECT),
        );
        move_from<Board>(object_address);
        orm_object::remove(user, object);
    }

    public fun get(object: address): Board acquires Board {
        object::address_to_object<Board>(object);
        *borrow_global<Board>(object)
    }

    #[test(aptos = @0x1, user1 = @0x456, user2 = @0x789, apto_orm = @apto_orm)]
    #[expected_failure(abort_code = 0x50003, location = orm_object)]
    public entry fun test_orm_object(aptos: &signer, apto_orm: &signer, user1: &signer, user2: &signer) acquires Board {
        // use aptos_std::debug;
        // debug::print<String>(&msg);

        test_utilities::init_network(aptos, 10);
        let program_address = signer::address_of(apto_orm);
        let user1_address = signer::address_of(user1);
        let user2_address = signer::address_of(user2);
        test_utilities::create_and_fund_account(program_address, 100);
        test_utilities::create_and_fund_account(user1_address, 100);
        test_utilities::create_and_fund_account(user2_address, 100);
        let package_address = orm_creator::get_creator_address(@apto_orm, string::utf8(b"user_package"));
        // debug::print<address>(&package_address);
        let package = orm_creator::create_creator(apto_orm, string::utf8(b"user_package"));
        init_module(&package);
        power_of_attorney::register_poa(apto_orm, user1, 1000, 0);
        let board_object1 = create(
            user1,
            package_address,
            string::utf8(b"title1"),
            string::utf8(b"description1"),
            0,
        );
        let board_object2 = create(
            user1,
            package_address,
            string::utf8(b"title2"),
            string::utf8(b"description2"),
            1,
        );
        let board_object1_address = object::object_address(&board_object1);
        let board_object2_address = object::object_address(&board_object2);
        let board1 = get(board_object1_address);
        assert!(board1.title == string::utf8(b"title1"), 1);
        assert!(board_object1_address != board_object2_address, 1);
        delete(user1, board_object1);

        // This should fail because user2 is not the owner of the object.
        delete(user2, board_object2);
    }

    #[test(aptos = @0x1, user1 = @0x456, user2 = @0x789, apto_orm = @apto_orm)]
    #[expected_failure(abort_code = 0x50003, location = orm_object)]
    public entry fun test_orm_object_transfer(aptos: &signer, apto_orm: &signer, user1: &signer, user2: &signer) acquires Board {
        // use aptos_std::debug;
        // debug::print<String>(&msg);

        test_utilities::init_network(aptos, 10);
        let program_address = signer::address_of(apto_orm);
        let user1_address = signer::address_of(user1);
        let user2_address = signer::address_of(user2);
        test_utilities::create_and_fund_account(program_address, 100);
        test_utilities::create_and_fund_account(user1_address, 100);
        test_utilities::create_and_fund_account(user2_address, 100);
        let package_address = orm_creator::get_creator_address(@apto_orm, string::utf8(b"user_package"));
        // debug::print<address>(&package_address);
        let package = orm_creator::create_creator(apto_orm, string::utf8(b"user_package"));
        init_module(&package);
        power_of_attorney::register_poa(apto_orm, user1, 1000, 0);
        let board_object1 = create_to(
            user1,
            package_address,
            string::utf8(b"title1"),
            string::utf8(b"description1"),
            0,
            user2_address,
        );
        let board_object2 = create(
            user1,
            package_address,
            string::utf8(b"title2"),
            string::utf8(b"description2"),
            1,
        );
        let board_object1_address = object::object_address(&board_object1);
        let board_object2_address = object::object_address(&board_object2);
        let board1 = get(board_object1_address);
        assert!(board1.title == string::utf8(b"title1"), 1);
        assert!(board_object1_address != board_object2_address, 1);
        
        // indirect transfer by creator
        orm_object::transfer_indirectly(user1, board_object2, user2_address);
        assert!(object::owner(board_object2) == user2_address, 1);
        
        // indirect transfer by creator
        orm_object::transfer_indirectly(user1, board_object2, user1_address);
        assert!(object::owner(board_object2) == user1_address, 1);
        
        // direct transfer by owner
        object::transfer(user1, board_object2, user2_address);
        assert!(object::owner(board_object2) == user2_address, 1);

        // indirect transfer by owner (should fail)
        orm_object::transfer_indirectly(user2, board_object2, user1_address);
    }
}
