export type DirectionalKey = 'next' | 'previous' | 'activate' | 'none';

export function toDirectionalKey(key: string): DirectionalKey {
	switch (key) {
		case 'ArrowRight':
		case 'ArrowDown':
			return 'next';
		case 'ArrowLeft':
		case 'ArrowUp':
			return 'previous';
		case 'Enter':
		case ' ':
			return 'activate';
		default:
			return 'none';
	}
}

export function cycleIndex(currentIndex: number, length: number, direction: 'next' | 'previous'): number {
	if (length <= 0) {
		return -1;
	}

	if (currentIndex < 0) {
		return 0;
	}

	if (direction === 'next') {
		return (currentIndex + 1) % length;
	}

	return (currentIndex - 1 + length) % length;
}
