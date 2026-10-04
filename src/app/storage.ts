/**
 * The app's storage, for the UI, which reaches storage only through src/app (ARCHITECTURE
 * "Modules"). Startup opens it, with the persistence request and unclean recovery
 * (`startApp`, startup.ts).
 */

export { StorageError, type AppStorage, type PersistenceStatus } from '../storage';
