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
		client: {start:"_app/immutable/entry/start.DDMyN5vo.js",app:"_app/immutable/entry/app.N9twnNsk.js",imports:["_app/immutable/entry/start.DDMyN5vo.js","_app/immutable/chunks/BepjT8VF.js","_app/immutable/chunks/z2rJ7Muw.js","_app/immutable/chunks/DVQ98otM.js","_app/immutable/entry/app.N9twnNsk.js","_app/immutable/chunks/z2rJ7Muw.js","_app/immutable/chunks/BrY87mzc.js","_app/immutable/chunks/BwX-dwOH.js","_app/immutable/chunks/DVQ98otM.js","_app/immutable/chunks/CVyt_cEL.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./chunks/0-0likzk3x.js')),
			__memo(() => import('./chunks/1-I_PSftUD.js')),
			__memo(() => import('./chunks/2-ABkRLcPB.js'))
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
