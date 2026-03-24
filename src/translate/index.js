
/* eslint-disable strict */
// var request = require('request');

const translatorApi = module.exports;

translatorApi.translate = function (postData) {
	// Returns [isEnglish, translatedContent]
	// For testing: Detect if post contains common non-English words
	// In production, this should call your actual translator API

	const content = postData.content || '';
	const nonEnglishKeywords = ['hola', 'bonjour', 'hallo', 'ciao', 'olá', 'привет', '你好', 'こんにちは'];

	// Check if content contains any non-English keywords
	const isEnglish = !nonEnglishKeywords.some(keyword =>
		content.toLowerCase().includes(keyword.toLowerCase()));

	// For testing: provide a sample translation
	const translatedContent = isEnglish ? '' :
		'[TRANSLATED] This is a sample translation. Connect your translator API to get real translations.';

	return [isEnglish, translatedContent];
};

// translatorApi.translate = async function (postData) {
//  Edit the translator URL below
//  const TRANSLATOR_API = "TODO"
//  const response = await fetch(TRANSLATOR_API+'/?content='+postData.content);
//  const data = await response.json();
//  return [data.is_english, data.translated_content];
// };
