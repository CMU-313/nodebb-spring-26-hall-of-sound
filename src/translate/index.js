/* eslint-disable strict */

const translatorApi = module.exports;
const TRANSLATOR_API = 'http://host.docker.internal:5000/';
const REQUEST_TIMEOUT_MS = 5000;

translatorApi.translate = async function (postData) {
	const content = (postData && postData.content) ? String(postData.content).trim() : '';
	if (!content) {
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
			return [true, ''];
		}
		const data = await response.json();
		if (typeof data.is_english !== 'boolean' || typeof data.translated_content !== 'string') {
			return [true, ''];
		}
		return [data.is_english, data.translated_content];
	} catch (err) {
		return [true, ''];
	} finally {
		clearTimeout(timeout);
	}
};
