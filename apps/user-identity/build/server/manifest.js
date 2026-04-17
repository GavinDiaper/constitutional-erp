const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.CjkzVTJh.js",app:"_app/immutable/entry/app.D0P0blca.js",imports:["_app/immutable/entry/start.CjkzVTJh.js","_app/immutable/chunks/DbKsza2a.js","_app/immutable/chunks/Cq5QDQ4r.js","_app/immutable/chunks/DkhWXAjQ.js","_app/immutable/entry/app.D0P0blca.js","_app/immutable/chunks/Cq5QDQ4r.js","_app/immutable/chunks/CBesaTOz.js","_app/immutable/chunks/BEE9BKhQ.js","_app/immutable/chunks/DkhWXAjQ.js","_app/immutable/chunks/GBAEcOGc.js","_app/immutable/chunks/Dm3k2IPD.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./chunks/0-CSkKHpth.js')),
			__memo(() => import('./chunks/1-DYt9Fd1N.js')),
			__memo(() => import('./chunks/2-CHDrpqoB.js')),
			__memo(() => import('./chunks/3-CpWoOoM0.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/auth/callback",
				pattern: /^\/auth\/callback\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/login/[provider]",
				pattern: /^\/login\/([^/]+?)\/?$/,
				params: [{"name":"provider","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-D_dpyugM.js'))
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

const prerendered = new Set([]);

const base = "";

export { base, manifest, prerendered };
//# sourceMappingURL=manifest.js.map
