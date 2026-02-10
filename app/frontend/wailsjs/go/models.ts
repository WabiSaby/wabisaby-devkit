export namespace model {
	
	export class BackendService {
	    name: string;
	    group: string;
	    port?: number;
	    status: string;
	    pid?: number;
	    healthUrl?: string;
	    docsUrl?: string;
	    error?: string;
	    lastOutput?: string[];
	
	    static createFrom(source: any = {}) {
	        return new BackendService(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.group = source["group"];
	        this.port = source["port"];
	        this.status = source["status"];
	        this.pid = source["pid"];
	        this.healthUrl = source["healthUrl"];
	        this.docsUrl = source["docsUrl"];
	        this.error = source["error"];
	        this.lastOutput = source["lastOutput"];
	    }
	}
	export class Dependency {
	    name: string;
	    version: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new Dependency(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.type = source["type"];
	    }
	}
	export class EnvVar {
	    name: string;
	    value: string;
	    isSet: boolean;
	    required: boolean;
	    sensitive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EnvVar(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.isSet = source["isSet"];
	        this.required = source["required"];
	        this.sensitive = source["sensitive"];
	    }
	}
	export class EnvStatus {
	    hasEnvFile: boolean;
	    hasExample: boolean;
	    requiredVars: EnvVar[];
	    optionalVars: EnvVar[];
	    customVars: EnvVar[];
	
	    static createFrom(source: any = {}) {
	        return new EnvStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasEnvFile = source["hasEnvFile"];
	        this.hasExample = source["hasExample"];
	        this.requiredVars = this.convertValues(source["requiredVars"], EnvVar);
	        this.optionalVars = this.convertValues(source["optionalVars"], EnvVar);
	        this.customVars = this.convertValues(source["customVars"], EnvVar);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Migration {
	    version: number;
	    name: string;
	    applied: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Migration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.name = source["name"];
	        this.applied = source["applied"];
	    }
	}
	export class MigrationStatus {
	    currentVersion: number;
	    dirty: boolean;
	    migrations: Migration[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new MigrationStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.dirty = source["dirty"];
	        this.migrations = this.convertValues(source["migrations"], Migration);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Notice {
	    id: string;
	    severity: string;
	    message: string;
	    actionKey?: string;
	
	    static createFrom(source: any = {}) {
	        return new Notice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.severity = source["severity"];
	        this.message = source["message"];
	        this.actionKey = source["actionKey"];
	    }
	}
	export class Prerequisite {
	    name: string;
	    installed: boolean;
	    version?: string;
	    required: boolean;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new Prerequisite(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.required = source["required"];
	        this.message = source["message"];
	    }
	}
	export class Project {
	    name: string;
	    branch: string;
	    commit: string;
	    dirty: boolean;
	    status: string;
	    language?: string;
	    repoUrl?: string;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.branch = source["branch"];
	        this.commit = source["commit"];
	        this.dirty = source["dirty"];
	        this.status = source["status"];
	        this.language = source["language"];
	        this.repoUrl = source["repoUrl"];
	    }
	}
	export class ProtoStatus {
	    outOfDate: boolean;
	    message: string;
	    protosPath?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProtoStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outOfDate = source["outOfDate"];
	        this.message = source["message"];
	        this.protosPath = source["protosPath"];
	    }
	}
	export class Service {
	    name: string;
	    port: number;
	    status: string;
	    url?: string;
	
	    static createFrom(source: any = {}) {
	        return new Service(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.port = source["port"];
	        this.status = source["status"];
	        this.url = source["url"];
	    }
	}

}

export namespace service {
	
	export class DeviceFlowResponse {
	    userCode: string;
	    verificationUri: string;
	    expiresIn: number;
	
	    static createFrom(source: any = {}) {
	        return new DeviceFlowResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.userCode = source["userCode"];
	        this.verificationUri = source["verificationUri"];
	        this.expiresIn = source["expiresIn"];
	    }
	}
	export class Permissions {
	    connected: boolean;
	    username: string;
	    avatarUrl: string;
	    teams: string[];
	    views: string[];
	    commands: string[];
	
	    static createFrom(source: any = {}) {
	        return new Permissions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connected = source["connected"];
	        this.username = source["username"];
	        this.avatarUrl = source["avatarUrl"];
	        this.teams = source["teams"];
	        this.views = source["views"];
	        this.commands = source["commands"];
	    }
	}

}

