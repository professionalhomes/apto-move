#[test_only]
module apto_orm::test_orm_token {
    use apto_orm::test_utilities;
    use apto_orm::power_of_attorney;
    use apto_orm::orm_class;
    use apto_orm::orm_creator;
    use apto_orm::orm_module;
    use apto_orm::orm_object;
    use aptos_framework::object::{Self, Object};
    use aptos_token_objects::token;
    use std::error;
    use std::option;
    use std::signer;
    use std::string;

    const CLASS_NAME: vector<u8> = b"Membership";
    const EMEMBERSHIP_OBJECT_NOT_FOUND: u64 = 1;
    const ENOT_MEMBERSHIP_OBJECT: u64 = 2;

    struct Membership has key, copy, drop {
    }

    fun init_module(package: &signer) {
        let class_signer = orm_class::create_class_as_collection<Membership>(
            package,
            string::utf8(CLASS_NAME),
            true, true, false, true, false, true, false,
            string::utf8(b"https://example.com"),
            string::utf8(b"Membership token for AptoORM users"),
            1000,
            false,
            true,
            @0x1,
            100,
            10,
        );
        orm_module::set<Membership>(
            package,
            signer::address_of(package),
            signer::address_of(&class_signer),
        );
    }

    public fun create(
        user: &signer,
        package: address,
        name: string::String,
        uri: string::String,
        description: string::String,
    ): Object<Membership>{
        let (orm_creator, orm_class) = orm_module::get<Membership>(package);
        let creator_signer = orm_creator::load_creator(user, orm_creator);
        let ref = token::create(
            &creator_signer,
            string::utf8(CLASS_NAME),
            description,
            name,
            option::none(),
            uri,
        );
        let object_signer = orm_object::init<Membership>(&creator_signer, &ref, orm_class);
        move_to<Membership>(&object_signer, Membership {
        });
        object::object_from_constructor_ref<Membership>(&ref)
    }

    public fun update<T: key>(
        user: &signer,
        object: Object<T>,
        name: string::String,
        uri: string::String,
        description: string::String,
    ) {
        let object_address = object::object_address(&object);
        assert!(
            exists<Membership>(object_address),
            error::invalid_argument(ENOT_MEMBERSHIP_OBJECT),
        );
        orm_object::load_signer(user, object);
        orm_object::set_name(user, object, name);
        orm_object::set_uri(user, object, uri);
        orm_object::set_description(user, object, description);
    }

    public fun delete<T: key>(
        user: &signer,
        object: Object<T>,
    ) acquires Membership {
        let object_address = object::object_address(&object);
        assert!(
          exists<Membership>(object_address),
          error::invalid_argument(ENOT_MEMBERSHIP_OBJECT),
        );
        move_from<Membership>(object_address);
        orm_object::remove(user, object);
    }

    public fun get(object: address): Membership acquires Membership {
        object::address_to_object<Membership>(object);
        *borrow_global<Membership>(object)
    }

    #[test(aptos = @0x1, user1 = @0x456, user2 = @0x789, apto_orm = @apto_orm)]
    #[expected_failure(abort_code = 0x50003, location = orm_object)]
    public entry fun test_orm_token(
        aptos: &signer, apto_orm: &signer, user1: &signer, user2: &signer
    ) acquires Membership {
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
        let package = orm_creator::create_creator(apto_orm, string::utf8(b"user_package"));
        init_module(&package);

        // check the token class (collection) is updatable
        let (_, c) = orm_module::get<Membership>(package_address);
        orm_class::set_uri(apto_orm, c, string::utf8(b"https://example.com"));

        power_of_attorney::register_poa(apto_orm, user1, 1000, 0);
        let membership_object1 = create(
            user1,
            package_address,
            string::utf8(b"AptoORM membership #1"),
            string::utf8(b"description1"),
            string::utf8(b"https://example.com/membership1"),
        );
        let membership_object2 = create(
            user1,
            package_address,
            string::utf8(b"AptoORM membership #2"),
            string::utf8(b"description2"),
            string::utf8(b"https://example.com/membership2"),
        );
        let membership_object1_address = object::object_address(&membership_object1);
        let membership_object2_address = object::object_address(&membership_object2);
        assert!(token::name(membership_object2) == string::utf8(b"AptoORM membership #2"), 1);
        assert!(membership_object1_address != membership_object2_address, 1);
        delete(user1, membership_object1);

        // This should fail because user2 is not the owner of the object.
        delete(user2, membership_object2);
    }
}
