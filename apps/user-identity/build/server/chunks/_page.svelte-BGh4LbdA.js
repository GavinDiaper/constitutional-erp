import { h as head, j as ensure_array_like, k as attr, d as escape_html } from './renderer-D2L8fenf.js';

function _page($$renderer) {
  const providers = [
    { id: "google", label: "Sign in with Google" },
    { id: "microsoft", label: "Sign in with Microsoft" },
    { id: "apple", label: "Sign in with Apple" }
  ];
  head("1uha8ag", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>User Identity | Constitutional ERP</title>`);
    });
  });
  $$renderer.push(`<section class="card svelte-1uha8ag"><p class="eyebrow svelte-1uha8ag">Constitutional ERP</p> <h1 class="svelte-1uha8ag">Identity Sign In</h1> <p class="subhead svelte-1uha8ag">Choose your provider to continue.</p> <div class="actions svelte-1uha8ag"><!--[-->`);
  const each_array = ensure_array_like(providers);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let provider = each_array[$$index];
    $$renderer.push(`<a class="action svelte-1uha8ag"${attr("href", `/login/${provider.id}`)}>${escape_html(provider.label)}</a>`);
  }
  $$renderer.push(`<!--]--></div></section>`);
}

export { _page as default };
//# sourceMappingURL=_page.svelte-BGh4LbdA.js.map
