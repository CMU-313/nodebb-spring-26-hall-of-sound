'use strict';

const plugin = module.exports;

plugin.init = async function (params) {
	// No server-side initialization needed.
	// The topic type feature is handled entirely client-side:
	//   - Radio buttons are injected into the composer via static/lib/main.js
	//   - topicType is added to the submit payload via the filter:composer.submit hook
	// Server-side logic (adding Question/Note tags based on topicType) lives in
	//   src/topics/create.js, src/topics/tags.js, and src/api/topics.js
};
