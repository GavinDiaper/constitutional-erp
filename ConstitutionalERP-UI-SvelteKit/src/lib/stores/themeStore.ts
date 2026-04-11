import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'erp-theme';

function getInitialTheme(): Theme {
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark') {
			return stored;
		}
	}
	return 'dark';
}

function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>(getInitialTheme());

	return {
		subscribe,
		set(theme: Theme) {
			if (browser) {
				localStorage.setItem(STORAGE_KEY, theme);
				document.documentElement.className = theme;
			}
			set(theme);
		},
		toggleTheme() {
			update((current) => {
				const next: Theme = current === 'dark' ? 'light' : 'dark';
				if (browser) {
					localStorage.setItem(STORAGE_KEY, next);
					document.documentElement.className = next;
				}
				return next;
			});
		}
	};
}

export const themeStore = createThemeStore();
