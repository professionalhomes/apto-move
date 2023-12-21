module apto_orm::orm_module {
    use std::error;
    use aptos_framework::object::{Self, Object};
    use apto_orm::orm_creator::{OrmCreator};
    use apto_orm::orm_class::{OrmClass};

    const EORM_MODULE_NOT_FOUND: u64 = 1;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    /// OrmModule recoards the ORM class type to the module
    struct OrmModule<phantom T> has key {
        signer: Object<OrmCreator>,
        class: Object<OrmClass>,
    }

    public fun set<T: key>(
        publisher: &signer, signer: address, class: address,
    ) {
        move_to(publisher, OrmModule<T> {
            signer: object::address_to_object<OrmCreator>(signer),
            class: object::address_to_object<OrmClass>(class),
        });
    }

    #[view]
    public fun get<T: key>(
        publisher: address
    ): (Object<OrmCreator>, Object<OrmClass>) acquires OrmModule {
        assert!(
            exists<OrmModule<T>>(publisher),
            error::not_found(EORM_MODULE_NOT_FOUND),
        );
        let orm_module = borrow_global<OrmModule<T>>(publisher);
        (orm_module.signer, orm_module.class)
    }
}
