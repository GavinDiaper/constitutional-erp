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
		client: {start:"_app/immutable/entry/start.B9Yx0W7k.js",app:"_app/immutable/entry/app.nMRl8CMC.js",imports:["_app/immutable/entry/start.B9Yx0W7k.js","_app/immutable/chunks/jmA1SyAS.js","_app/immutable/chunks/CEIzcWLC.js","_app/immutable/chunks/DfM2MhfM.js","_app/immutable/entry/app.nMRl8CMC.js","_app/immutable/chunks/CEIzcWLC.js","_app/immutable/chunks/B5GyXdeq.js","_app/immutable/chunks/DxKDoDer.js","_app/immutable/chunks/DfM2MhfM.js","_app/immutable/chunks/DOKpyC5G.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./chunks/0-N7sJYsY7.js')),
			__memo(() => import('./chunks/1-DZQej15h.js')),
			__memo(() => import('./chunks/2-C0ZhILXY.js')),
			__memo(() => import('./chunks/3-B1rS21e5.js'))
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
				endpoint: __memo(() => import('./chunks/_server.ts-Bc1Gul-z.js'))
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
