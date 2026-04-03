/* eslint-disable strict */

const fs = require('fs');
const path = require('path');

const translatorApi = module.exports;
const TRANSLATOR_API = 'http://172.17.0.1:5000/';
const REQUEST_TIMEOUT_MS = 15000;
const LOG_FILE = path.join(__dirname, '..', '..', 'translation_debug.log');
const DEBUG_TRANSLATION = false;

function logTranslation(entry) {
	if (!DEBUG_TRANSLATION) return;
	const line = `[${new Date().toISOString()}] ${JSON.stringify(entry)}\n`;
	console.log('[TRANSLATE]', JSON.stringify(entry));
	fs.appendFile(LOG_FILE, line, () => {});
}

translatorApi.translate = async function (postData) {
	const content = (postData && postData.content) ? String(postData.content).trim() : '';
	if (!content) {
		logTranslation({ input: '', output: null, parsed: { isEnglish: true, translatedContent: '' }, note: 'empty input' });
		return [true, ''];
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const url = new URL(TRANSLATOR_API);
		url.searchParams.set('content', content);
		const response = await fetch(url, {
			method: 'GET',
			signal: controller.signal,
		});
		if (!response.ok) {
			logTranslation({ input: content, output: `HTTP ${response.status}`, parsed: { isEnglish: true, translatedContent: '' }, note: 'non-ok response' });
			return [true, ''];
		}
		const data = await response.json();
		if (typeof data.is_english !== 'boolean' || typeof data.translated_content !== 'string') {
			logTranslation({ input: content, output: data, parsed: { isEnglish: true, translatedContent: '' }, note: 'invalid response format' });
			return [true, ''];
		}
		logTranslation({
			input: content,
			output: data,
			parsed: {
				isEnglish: data.is_english,
				translatedContent: data.translated_content,
			},
		});
		return [data.is_english, data.translated_content];
	} catch (err) {
		logTranslation({ input: content, output: err.message, parsed: { isEnglish: true, translatedContent: '' }, note: 'exception' });
		return [true, ''];
	} finally {
		clearTimeout(timeout);
	}
};
