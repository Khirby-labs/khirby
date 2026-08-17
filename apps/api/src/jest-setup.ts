/**
 * Runs before each test file is loaded.
 * google-auth-library / gcp-metadata otherwise ping 169.254.169.254 and leave
 * a socket that keeps a Jest worker from exiting ("force exited" teardown warning).
 */
process.env.METADATA_SERVER_DETECTION = 'none';
