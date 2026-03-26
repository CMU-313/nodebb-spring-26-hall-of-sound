/* eslint-disable strict */

const translatorApi = module.exports;
const HARDCODED_TRANSLATION = '[hardcoded] Translated content';

translatorApi.translate = async function (postData) {
	const content = (postData && postData.content) ? String(postData.content).trim() : '';
	if (!content) {
		return [true, ''];
	}

	return [false, HARDCODED_TRANSLATION];
};
