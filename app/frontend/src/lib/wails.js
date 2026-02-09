// Wails API wrapper
const getApp = () => window.go?.main?.App;
const getRuntime = () => window.runtime;

async function callForSuccess(promise) {
    try {
        const data = await promise;
        return { success: true, data };
    } catch (error) {
        console.error('Wails error:', error);
        return { success: false, message: error.message || String(error) };
    }
}

export const projects = {
    list: () => callForSuccess(getApp()?.ListProjects()),
    clone: (name) => callForSuccess(getApp()?.ProjectClone(name)),
    update: (name) => callForSuccess(getApp()?.ProjectUpdate(name)),
    open: (name) => callForSuccess(getApp()?.ProjectOpen(name)),
    startStream: (name, op) => callForSuccess(getApp()?.StartProjectStream(name, op)),
    stopStream: (name, op) => getApp()?.StopProjectStream(name, op),
    startBulkStream: (action) => callForSuccess(getApp()?.StartBulkProjectStream(action)),
    stopBulkStream: (action) => getApp()?.StopBulkProjectStream(action),
    createTag: (name, tag, msg, push) => callForSuccess(getApp()?.CreateTag(name, tag, msg, push)),
    listTags: (name) => callForSuccess(getApp()?.ListTags(name)),
    dependencies: (name) => callForSuccess(getApp()?.ListProjectDependencies(name)),
};

export const services = {
    list: () => getApp()?.ListServices() ?? Promise.resolve([]),
    start: (name) => callForSuccess(getApp()?.StartService(name)),
    stop: (name) => callForSuccess(getApp()?.StopService(name)),
    startAll: () => callForSuccess(getApp()?.StartAllServices()),
    stopAll: () => callForSuccess(getApp()?.StopAllServices()),
    startLogsStream: (name) => getApp()?.StartServiceLogsStream(name),
    stopLogsStream: (name) => getApp()?.StopServiceLogsStream(name),
};

export const backend = {
    list: () => getApp()?.ListBackendServices() ?? Promise.resolve([]),
    health: (name) => callForSuccess(getApp()?.BackendHealth(name)),
    start: (name) => callForSuccess(getApp()?.StartBackendService(name)),
    stop: (name) => callForSuccess(getApp()?.StopBackendService(name)),
    startGroup: (group) => callForSuccess(getApp()?.StartBackendGroup(group)),
    stopGroup: (group) => callForSuccess(getApp()?.StopBackendGroup(group)),
    startLogsStream: (name) => getApp()?.StartBackendLogsStream(name),
    stopLogsStream: (name) => getApp()?.StopBackendLogsStream(name),
};

export const migration = {
    getStatus: () => getApp()?.GetMigrationStatus() ?? Promise.resolve(null),
    runUp: () => callForSuccess(getApp()?.RunMigrationUp()),
    runDown: () => callForSuccess(getApp()?.RunMigrationDown()),
    startStream: (action) => getApp()?.StartMigrationStream(action),
    stopStream: (action) => getApp()?.StopMigrationStream(action),
};

export const proto = {
    getStatus: () => getApp()?.GetProtoStatus() ?? Promise.resolve(null),
    startStream: () => getApp()?.StartProtoStream(),
    stopStream: () => getApp()?.StopProtoStream(),
};

export const generate = {
    run: () => callForSuccess(getApp()?.RunGenerate()),
};

export const env = {
    getStatus: () => getApp()?.GetEnvStatus() ?? Promise.resolve(null),
    copyExample: () => callForSuccess(getApp()?.CopyEnvExample()),
    validate: () => callForSuccess(getApp()?.ValidateEnv()),
    updateVar: (name, value) => callForSuccess(getApp()?.UpdateEnvVar(name, value)),
    deleteVar: (name) => callForSuccess(getApp()?.DeleteEnvVar(name)),
};

export const prerequisites = {
    list: () => getApp()?.GetPrerequisites() ?? Promise.resolve([]),
};

export const notices = {
    list: () => getApp()?.GetNotices() ?? Promise.resolve([]),
};

export const status = {
    get: () => getApp()?.Status() ?? Promise.resolve({}),
};

export const submodule = {
    getSyncStatus: () => getApp()?.SubmoduleSyncStatus() ?? Promise.resolve({}),
    sync: (message) => callForSuccess(getApp()?.SubmoduleSync(message)),
};

export const github = {
    startDeviceFlow: () => callForSuccess(getApp()?.GitHubStartDeviceFlow()),
    pollAuth: () => callForSuccess(getApp()?.GitHubPollAuth()),
    getStatus: () => getApp()?.GitHubGetStatus() ?? Promise.resolve({ connected: false }),
    disconnect: () => getApp()?.GitHubDisconnect() ?? Promise.resolve({ connected: false }),
    refreshTeams: () => callForSuccess(getApp()?.GitHubRefreshTeams()),
};

export const events = {
    on: (event, cb) => getRuntime()?.EventsOn(event, cb),
    off: (event) => getRuntime()?.EventsOff(event),
    emit: (event, data) => getRuntime()?.EventsEmit(event, data),
};
