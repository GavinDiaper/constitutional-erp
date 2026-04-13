import { j as store_get, k as head, l as ensure_array_like, m as attr, d as escape_html, o as unsubscribe_stores, f as getContext } from './renderer-ChLcKSye.js';
import './root-DMJibEMq.js';
import './state.svelte-Db6z29UY.js';

const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let next;
    const providers = [
      { id: "google", label: "Sign in with Google" },
      { id: "microsoft", label: "Sign in with Microsoft" },
      { id: "apple", label: "Sign in with Apple" }
    ];
    next = store_get($$store_subs ??= {}, "$page", page).url.searchParams.get("next") ?? "/dashboard";
    head("1uha8ag", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>User Identity | Constitutional ERP</title>`);
      });
    });
    $$renderer2.push(`<section class="card svelte-1uha8ag"><p class="eyebrow svelte-1uha8ag">Constitutional ERP</p> <h1 class="svelte-1uha8ag">Identity Sign In</h1> <p class="subhead svelte-1uha8ag">Choose your provider to continue.</p> <div class="actions svelte-1uha8ag"><!--[-->`);
    const each_array = ensure_array_like(providers);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let provider = each_array[$$index];
      $$renderer2.push(`<a class="action svelte-1uha8ag"${attr("href", `/login/${provider.id}?next=${encodeURIComponent(next)}`)}>${escape_html(provider.label)}</a>`);
    }
    $$renderer2.push(`<!--]--></div></section>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-CDS-4Zf3.js.map
