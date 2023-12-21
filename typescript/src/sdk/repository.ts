import { OrmClient } from "./client"
import { OrmObjectLiteral, OrmObjectTarget } from "./types"
/**
 * Repository is supposed to work with your entity objects. Find entities, insert, update, delete, etc.
 */
export class Repository<OrmObject extends OrmObjectLiteral> {
  // -------------------------------------------------------------------------
  // Public Properties
  // -------------------------------------------------------------------------

  /**
   * OrmObject target that is managed by this repository.
   * If this repository manages entity from schema,
   * then it returns a name of that schema instead.
   */
  readonly target: OrmObjectTarget<OrmObject>

  /**
   * OrmClient used by this repository.
   */
  readonly client: OrmClient

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  // /**
  //  * Entity metadata of the entity current repository manages.
  //  */
  // get metadata() {
  //     return this.client.getMetadata(this.target)
  // }
}