module apto_orm::object_utility {
    use std::error;

    use aptos_framework::account;
    use aptos_framework::object::{Self, Object};

    /// Address where unwanted objects can be forcefully transferred to.
    const BURN_ADDRESS: address = @0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    /// Address where the initial object is located.
    const INIT_ADDRESS: address = @0x0;

    /// invalid owner of the object
    const EOWNER_NOT_FOUND: u64 = 1;

    #[view]
    public fun owner<T: key>(object: Object<T>): address {
        let owner = object::owner(object);
        while (!account::exists_at(owner)) {
            let owner_obj = object::address_to_object<object::ObjectCore>(owner);
            owner = object::owner<object::ObjectCore>(owner_obj);
        };
        assert!(
            owner != BURN_ADDRESS && owner != INIT_ADDRESS,
            error::not_found(EOWNER_NOT_FOUND)
        );
        owner
    }

    #[view]
    public fun is_owner<T: key>(object: Object<T>, owner: address): bool {
        let cur_owner = object::owner(object);
        while (!account::exists_at(cur_owner)) {
            if (owner == cur_owner) {
                return true
            };
            let owner_obj = object::address_to_object<object::ObjectCore>(cur_owner);
            cur_owner = object::owner<object::ObjectCore>(owner_obj);
        };
        if (owner == cur_owner) {
            return true
        };
        false
    }
}