'use strict';

const assert = require('assert');

const translate = require('../src/translate');

describe('Translation adapter', () => {
	it('should return english fallback for empty content', async () => {
		const result = await translate.translate({ content: '   ' });
		assert.deepStrictEqual(result, [true, '']);
	});

	it('should return hardcoded translation for non-empty content', async () => {
		const result = await translate.translate({ content: 'hola mundo' });
		assert.deepStrictEqual(result, [false, '[hardcoded] Translated content']);
	});
});
