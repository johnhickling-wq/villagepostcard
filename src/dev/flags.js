// Development-only switches. DEV_TOOLS puts a Developer button in Settings
// and the pause menu (src/dev/devtools.js) and the playtest bug button on
// every screen (src/dev/feedback.js). It must be false for a store release:
// see docs/RELEASE_BLOCKERS.md.
export const DEV_TOOLS = true;

/** Where playtest reports are filed, as GitHub issues ("owner/repo"). */
export const FEEDBACK_REPO = 'johnhickling-wq/villagepostcard';
