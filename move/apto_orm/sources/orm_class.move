module apto_orm::orm_class {
    use std::signer;
    use std::error;
    // use std::vector;
    use std::option;
    use std::string::{Self, String};
    use aptos_framework::event;
    use aptos_framework::object::{Self, Object};
    use aptos_std::type_info;
    
    use aptos_token_objects::collection;
    // use aptos_token_objects::property_map;
    // use aptos_token_objects::token;
    use aptos_token_objects::royalty;

    use apto_orm::orm_creator::OrmCreator;

    friend apto_orm::orm_object;

    const ENOT_DATA_OBJECT: u64 = 1;
    const ENOT_AUTHORIZED_OWNER: u64 = 2;
    const EORM_CLASS_NOT_FOUND: u64 = 3;
    const EORM_COLLECTION_NOT_FOUND: u64 = 4;

    struct OrmEvent has drop, store {
        object: address,
        type: String,
        event_type: String,
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    /// OrmClass is used to identify ORM objects
    struct OrmClass has key {
        creator: Object<OrmCreator>,
        name: String,
        type: String,
        token_object: bool,
        direct_transfer: bool,
	    deletable_by_creator: bool,
	    deletable_by_owner: bool,
	    indirect_transfer_by_creator: bool,
	    indirect_transfer_by_owner: bool,
	    extensible_by_creator: bool,
        extensible_by_owner: bool,
        events: event::EventHandle<OrmEvent>,
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    /// OrmTokenClass is used to identity ORM class for token objects
    struct OrmTokenClass has key {
        /// Used to mutate collection fields
        mutator_ref: collection::MutatorRef,
        /// Used to mutate royalties
        royalty_mutator_ref: royalty::MutatorRef,
        /// token royalty is present
        royalty_present: bool,
        /// token proerty map is used
        token_use_property_map: bool,
        /// [FIXME]
        token_mutable_by_creator: bool,
        token_mutable_by_owner: bool,
    }

    inline fun borrow_class<T: key>(object: &Object<T>): &OrmClass acquires OrmClass {
        let object_address = object::object_address(object);
        assert!(
            exists<OrmClass>(object_address),
            error::not_found(EORM_CLASS_NOT_FOUND),
        );
        borrow_global<OrmClass>(object_address)
    }

    inline fun borrow_class_mut<T: key>(object: &Object<T>): &mut OrmClass acquires OrmClass {
        let object_address = object::object_address(object);
        assert!(
            exists<OrmClass>(object_address),
            error::not_found(EORM_CLASS_NOT_FOUND),
        );
        borrow_global_mut<OrmClass>(object_address)
    }

    inline fun borrow_collection<T: key>(object: &Object<T>): &OrmTokenClass acquires OrmTokenClass {
        let object_address = object::object_address(object);
        assert!(
            exists<OrmTokenClass>(object_address),
            error::not_found(EORM_COLLECTION_NOT_FOUND),
        );
        borrow_global<OrmTokenClass>(object_address)
    }

    inline fun borrow_collection_mut<T: key>(object: &Object<T>): &mut OrmTokenClass acquires OrmTokenClass {
        let object_address = object::object_address(object);
        assert!(
            exists<OrmTokenClass>(object_address),
            error::not_found(EORM_COLLECTION_NOT_FOUND),
        );
        borrow_global_mut<OrmTokenClass>(object_address)
    }

    public fun create_class_as_object<UserClass: key>(
        creator: &signer,
        name: String,
        direct_transfer: bool,
        deletable_by_creator: bool,
        deletable_by_owner: bool,
        indirect_transfer_by_creator: bool,
        indirect_transfer_by_owner: bool,
        extensible_by_creator: bool,
        extensible_by_owner: bool,
    ): signer {
        let creator_address = signer::address_of(creator);
        // let seed = b"orm_class::";
        // vector::append(&mut seed, *string::bytes(&name));
        let ref = object::create_named_object(creator, *string::bytes(&name));
        let class = OrmClass {
            creator: object::address_to_object<OrmCreator>(creator_address),
            name,
            type: type_info::type_name<UserClass>(),
            token_object: false,
            direct_transfer,
            deletable_by_creator,
            deletable_by_owner,
            indirect_transfer_by_creator,
            indirect_transfer_by_owner,
            extensible_by_creator,
            extensible_by_owner,
            events: object::new_event_handle(creator),
        };
        let class_signer = object::generate_signer(&ref);
        move_to(&class_signer, class);
        class_signer
    }

    public(friend) fun emit_event(class: Object<OrmClass>, object: address, event_type: String) acquires OrmClass {
        let class_address = object::object_address(&class);
        let c = borrow_global_mut<OrmClass>(class_address);
        event::emit_event(&mut c.events,
            OrmEvent { object, type: c.type, event_type },
        );
    }

    public fun create_class_as_collection<UserClass: key>(
        creator: &signer,
        name: String,
        direct_transfer: bool,
        deletable_by_creator: bool,
        deletable_by_owner: bool,
        indirect_transfer_by_creator: bool,
        indirect_transfer_by_owner: bool,
        extensible_by_creator: bool,
        extensible_by_owner: bool,
        collection_uri: String,
        collection_description: String,
        collection_max_supply: u64,
        collection_token_use_property_map: bool,
        collection_royalty_present: bool,
        collection_royalty_payee: address,
        collection_royalty_denominator: u64,
        collection_royalty_numerator: u64,
    ): signer {
        let creator_address = signer::address_of(creator);
        let royalty_payee = if (collection_royalty_payee == @0x0) {
            collection::create_collection_address(&creator_address, &name)
        } else {
            collection_royalty_payee
        };
        let collection_royalty = royalty::create(
            collection_royalty_numerator,
            collection_royalty_denominator,
            royalty_payee);
        let ref = if (collection_max_supply > 0) {
            collection::create_fixed_collection(
                creator, collection_description,
                collection_max_supply, name,
                option::some(collection_royalty),
                collection_uri,
            )
        } else {
            collection::create_unlimited_collection(
                creator, collection_description,
                name, option::some(collection_royalty),
                collection_uri,
            )
        };
        let class = OrmClass {
            creator: object::address_to_object<OrmCreator>(creator_address),
            name,
            type: type_info::type_name<UserClass>(),
            token_object: true,
            direct_transfer,
            deletable_by_creator,
            deletable_by_owner,
            indirect_transfer_by_creator,
            indirect_transfer_by_owner,
            extensible_by_creator,
            extensible_by_owner,
            events: object::new_event_handle(creator),
        };
        let class_collection = OrmTokenClass {
            mutator_ref: collection::generate_mutator_ref(&ref),
            royalty_mutator_ref: royalty::generate_mutator_ref(
                object::generate_extend_ref(&ref)
            ),
            royalty_present: collection_royalty_present,
            token_use_property_map: collection_token_use_property_map,
            token_mutable_by_creator: extensible_by_creator,
            token_mutable_by_owner: extensible_by_owner,
        };
        let class_signer = object::generate_signer(&ref);
        move_to(&class_signer, class);
        move_to(&class_signer, class_collection);
        class_signer
    }

    // #[view]
    // public fun is_owner_of_creator(class_object: Object<OrmClass>, owner: address): bool {
    //     let class = borrow_class(&class_object);
    //     let owner_of_creator = object::owner(class.creator);
    //     if (class.creator != owner) {

    //     }
    // }

    #[view]
    public fun get_creator<T: key>(class: Object<T>): Object<OrmCreator> acquires OrmClass {
        let class = borrow_class(&class);
        class.creator
    }

    #[view]
    public fun is_class<T: key>(class: Object<T>): bool {
        let class_address = object::object_address(&class);
        exists<OrmClass>(class_address)
    }
    
    #[view]
    public fun is_token_class<T: key>(class: Object<T>): bool {
        let class_address = object::object_address(&class);
        exists<OrmTokenClass>(class_address)
    }

    #[view]
    public fun get_deletable<T: key>(class: Object<T>): (bool, bool) acquires OrmClass {
        let class = borrow_class(&class);
        (class.deletable_by_creator, class.deletable_by_owner)
    }

    #[view]
    public fun get_extensible<T: key>(class: Object<T>): (bool, bool) acquires OrmClass {
        let class = borrow_class(&class);
        (class.extensible_by_creator, class.extensible_by_owner)
    }

    #[view]
    public fun get_indirect_transfer<T: key>(class: Object<T>): (bool, bool) acquires OrmClass {
        let class = borrow_class(&class);
        (class.indirect_transfer_by_creator, class.indirect_transfer_by_owner)
    }

    #[view]
    public fun get_object_config<T: key>(class: Object<T>): (
        Object<OrmCreator>, String,
        bool, bool, bool, bool, bool, bool, bool, bool,
    ) acquires OrmClass {
        let class = borrow_class(&class);
        (
            class.creator,
            class.name,
            class.token_object,
            class.direct_transfer,
            class.deletable_by_creator,
            class.deletable_by_owner,
            class.indirect_transfer_by_creator,
            class.indirect_transfer_by_owner,
            class.extensible_by_creator,
            class.extensible_by_owner,
        )
    }

    #[view]
    public fun get_token_config<T: key>(class: Object<T>): (
        bool, bool, bool, bool,
    ) acquires OrmTokenClass {
        let collection = borrow_collection(&class);
        (
            collection.royalty_present,
            collection.token_use_property_map,
            collection.token_mutable_by_creator,
            collection.token_mutable_by_owner,
        )
    }
}
