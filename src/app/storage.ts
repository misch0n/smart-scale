/**
 * The app's storage, for the UI, which reaches storage only through src/app (ARCHITECTURE
 * "Modules"). T1.8 adds what startup does once it is open: the persistence request and unclean
 * recovery.
 */

export { openStorage, StorageError, type AppStorage } from '../storage';
