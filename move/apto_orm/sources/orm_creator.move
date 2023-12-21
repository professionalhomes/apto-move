/// `orm_creator` module provides a signer object that has a capability to generate
/// the signer used for orm object creation in this package. The signer object
/// returns back its signer if the transaction signer is the owner or an authorized
/// account using the object. The owner account can register or revoke the authorized
/// accounts directly or via the proof challenge.
module apto_orm::orm_creator {
    use std::signer;
    use std::error;
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use aptos_framework::object::{Self, Object, ConstructorRef};
    use aptos_framework::aptos_account;
    use apto_orm::power_of_attorney;

    const ENOT_SIGNER_OBJECT: u64 = 1;
    const ENOT_AUTHORIZED_OWNER: u64 = 2;
    const EDELEGATE_EXPIRED: u64 = 3;
    const ESIGN_FUNCTIONARITY_PAUSED: u64 = 4;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    /// OrmCreator generates the signer that is used for ORM object creation.
    /// The OrmCreator returns the signer of the object upon owner's request.
    struct OrmCreator has key {
        /// The creator of the ORM signer object
        creator: address,
        /// Used to add some new fields or load thesigner
        extend_ref: object::ExtendRef,
        /// Used to delete the object
        delete_ref: Option<object::DeleteRef>,
    }

    inline fun authorized_borrow<T: key>(object: &Object<T>, owner: address): &OrmCreator {
        let object_address = object::object_address(object);
        assert!(
            exists<OrmCreator>(object_address),
            error::not_found(ENOT_SIGNER_OBJECT),
        );
        power_of_attorney::check_authorized(object, owner);
        borrow_global<OrmCreator>(object_address)
    }

    inline fun borrow<T: key>(object: &Object<T>): &OrmCreator {
        let object_address = object::object_address(object);
        assert!(
            exists<OrmCreator>(object_address),
            error::not_found(ENOT_SIGNER_OBJECT),
        );
        power_of_attorney::check_paused(object_address);
        borrow_global<OrmCreator>(object_address)
    }

    /// The creating object refered by the ConstructorRef becomes a signer object.
    fun init_creator(ref: &ConstructorRef, owner: address): signer {
        let orm_creator = OrmCreator {
            creator: owner,
            extend_ref: object::generate_extend_ref(ref),
            delete_ref: if (object::can_generate_delete_ref(ref)) {
                option::some(object::generate_delete_ref(ref))
            } else {
                option::none()
            },
        };
        let object_signer = object::generate_signer(ref);
        move_to(&object_signer, orm_creator);
        aptos_account::create_account(signer::address_of(&object_signer));
        object_signer
    }


    /// Create a pure signer object with the given name
    public fun create_creator(user: &signer, name: String): signer acquires OrmCreator {
        if (string::length(&name) <= 0) {
            name = string::utf8(b"orm_creator");
        };
        let user_address = signer::address_of(user);
        let seed = *string::bytes(&name);
        let orm_creator_address = object::create_object_address(&user_address, seed);
        if (exists<OrmCreator>(orm_creator_address)) {
            let object = object::address_to_object<OrmCreator>(orm_creator_address);
            assert!(
                object::owner(object) == user_address,
                error::permission_denied(ENOT_AUTHORIZED_OWNER),
            );
            let orm_creator = borrow_global<OrmCreator>(orm_creator_address);
            return object::generate_signer_for_extending(&orm_creator.extend_ref)
        };
        let ref = object::create_named_object(user, seed);
        init_creator(&ref, user_address)
    }

    /// It loads the signer from the object if the transaction signer is the owner or
    /// an authorized delegator using the object.
    public fun load_creator(owner: &signer, object: Object<OrmCreator>): signer acquires OrmCreator {
        let owner_address = signer::address_of(owner);
        let orm_creator = authorized_borrow(&object, owner_address);
        object::generate_signer_for_extending(&orm_creator.extend_ref)
    }

    #[view]
    public fun get_creator_address(user: address, name: String): address {
        let seed = *string::bytes(&name);
        object::create_object_address(&user, seed)
    }

    // public fun load_creator_by_ticket<phantom ProofChallenge>() {} // TODO

}
