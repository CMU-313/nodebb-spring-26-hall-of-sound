'use strict';

define('forum/composerTopicSuggestions', ['api'], function (api) {
	const DEBOUNCE_MS = 400;
	const MIN_QUERY_LENGTH = 3;

	function init() {
		$(window).on('action:composer.loaded', function (ev, data) {
			if (!data.composerData || data.composerData.action !== 'topics.post') {
				return;
			}
			const postContainer = data.postContainer;
			if (postContainer.find('[data-component="composer/topic-suggestions"]').length) {
				return;
			}
			const titleContainer = postContainer.find('[data-component="composer/title"]').closest('.title-container');
			if (!titleContainer.length) {
				return;
			}
			const wrapper = $(
				'<div data-component="composer/topic-suggestions" class="composer-topic-suggestions w-100 mt-2 hidden">' +
				'<div class="small text-muted mb-1">Related topics</div>' +
				'<div class="composer-topic-suggestions-list list-group list-group-flush small"></div>' +
				'</div>'
			);
			titleContainer.after(wrapper);
			const listEl = wrapper.find('.composer-topic-suggestions-list');
			const titleInput = postContainer.find('input.title');
			if (!titleInput.length) {
				return;
			}
			let debounceTimer;
			titleInput.off('input.composerTopicSuggestions keyup.composerTopicSuggestions')
				.on('input.composerTopicSuggestions keyup.composerTopicSuggestions', function () {
					clearTimeout(debounceTimer);
					const query = String($(this).val() || '').trim();
					if (query.length < MIN_QUERY_LENGTH) {
						wrapper.addClass('hidden');
						listEl.empty();
						return;
					}
					debounceTimer = setTimeout(function () {
						fetchAndRender(query, listEl, wrapper);
					}, DEBOUNCE_MS);
				});
		});
	}

	function fetchAndRender(query, listEl, wrapper) {
		listEl.html('<div class="list-group-item text-muted text-center"><i class="fa fa-spinner fa-spin me-1"></i>Loading...</div>');
		wrapper.removeClass('hidden');
		api.get('/api/topic-suggestions', { query: query })
			.then(function (payload) {
				const topics = payload && payload.topics ? payload.topics : [];
				listEl.empty();
				if (topics.length === 0) {
					wrapper.addClass('hidden');
					return;
				}
				const baseUrl = (typeof config !== 'undefined' && config.relative_path) ? config.relative_path : '';
				topics.forEach(function (topic) {
					const href = baseUrl + '/topic/' + (topic.slug || topic.tid);
					const meta = [];
					if (topic.user && topic.user.username) {
						meta.push(topic.user.username);
					}
					if (topic.timestamp) {
						meta.push(new Date(topic.timestamp).toLocaleDateString());
					}
					const metaHtml = meta.length ? ' <span class="composer-topic-suggestions-meta text-muted">' + meta.join(' · ') + '</span>' : '';
					const item = $(
						'<a class="list-group-item list-group-item-action composer-topic-suggestion-item" href="' + escapeAttr(href) + '" target="_blank" rel="noopener">' +
						'<span class="composer-topic-suggestion-title">' + escapeHtml(topic.title || '') + '</span>' + metaHtml +
						'</a>'
					);
					listEl.append(item);
				});
			})
			.catch(function () {
				listEl.empty();
				wrapper.addClass('hidden');
			});
	}

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	function escapeAttr(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML.replace(/"/g, '&quot;');
	}

	return {
		init: init,
	};
});
