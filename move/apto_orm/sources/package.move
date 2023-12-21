/// `package` module provides a signer object that has a capability to generate
/// the signer used for orm object creation in this package. The signer object
/// returns back its signer if the transaction signer is the owner or an authorized
/// account using the object. The owner account can register or revoke the authorized
/// accounts directly or via the proof challenge.
module apto_orm::package {
    use std::signer;
    use std::string::{Self, String};
    use aptos_framework::object::{Self};
    use apto_orm::large_packages;
    use apto_orm::orm_creator::{Self, OrmCreator};

    const EPACKAGE_ACCOUNT_NOT_FOUND: u64 = 1;

    /// Create a package account (orm_creator object)
    public entry fun create_package(user: &signer, name: String) {
        orm_creator::create_creator(user, name);
    }

    /// Publish the package with the given metadata and code chunks to a package account (orm_creator).
    public entry fun publish_package(
        user: &signer,
        package: address,
        metadata_serialized: vector<u8>,
        code_indices: vector<u16>,
        code_chunks: vector<vector<u8>>,
        publish: bool,
        cleanup: bool,
    ) {
        let package_object = object::address_to_object<OrmCreator>(package);
        let package_signer = orm_creator::load_creator(user, package_object);
        if (cleanup) {
            large_packages::cleanup(&package_signer);
        };
        large_packages::stage_code(
            &package_signer,
            metadata_serialized,
            code_indices,
            code_chunks,
            publish,
        );
    }

    /// Publish the package with the given metadata and code chunks to orm_creator object account (package account).
    entry fun create_and_publish_package(
        user: &signer,
        name: String,
        metadata_serialized: vector<u8>,
        code_indices: vector<u16>,
        code_chunks: vector<vector<u8>>,
        publish: bool,
        cleanup: bool,
    ) {
        let user_address = signer::address_of(user);
        let package_address = orm_creator::get_creator_address(user_address, name);
        if (!object::is_object(package_address)) {
            orm_creator::create_creator(user, name);
        };
        let package_object = object::address_to_object<OrmCreator>(package_address);
        let package_signer = orm_creator::load_creator(user, package_object);
        if (cleanup) {
            large_packages::cleanup(&package_signer);
        };
        large_packages::stage_code(
            &package_signer,
            metadata_serialized,
            code_indices,
            code_chunks,
            publish,
        );
    }

    #[view]
    public fun get_package_address(user: address, name: String): address {
        let seed = *string::bytes(&name);
        object::create_object_address(&user, seed)
    }
}
