'use strict';

/**
 * Client-side plugin for the Question/Note topic type selector.
 *
 * 1. Injects radio buttons (Question / Note) into the composer when creating a new topic.
 * 2. Reads the selected value and adds `topicType` to the API payload on submit,
 *    so the server-side logic in create.js / tags.js can auto-add the tag.
 */
(function () {
	// ── HTML for the radio button group ──────────────────────────────────
	var radioHTML = [
		'<div data-component="composer/topic-type" class="d-flex align-items-center gap-2 ms-2">',
		'  <div class="form-check">',
		'    <input class="form-check-input" type="radio" name="topic-type"',
		'           id="topic-type-question" value="question" checked>',
		'    <label class="form-check-label" for="topic-type-question">Question</label>',
		'  </div>',
		'  <div class="form-check">',
		'    <input class="form-check-input" type="radio" name="topic-type"',
		'           id="topic-type-note" value="note">',
		'    <label class="form-check-label" for="topic-type-note">Note</label>',
		'  </div>',
		'</div>',
	].join('\n');

	// ── Inject radio buttons when the composer opens ─────────────────────
	function injectTopicTypeSelector(postContainer, composerData) {
		// Only for new-topic creation, not replies or edits
		if (!composerData || composerData.action !== 'topics.post') {
			return;
		}

		// Guard against double-injection (e.g. composer re-opened)
		if (postContainer.find('[data-component="composer/topic-type"]').length) {
			return;
		}

		// Place the radio group right after the title input area
		var titleEl = postContainer.find('[data-component="composer/title"]');
		if (titleEl.length) {
			titleEl.after(radioHTML);
		}
	}

	// ── Hook: composer loaded (jQuery event on window) ────────────────────
	$(window).on('action:composer.loaded', function (_ev, data) {
		injectTopicTypeSelector(data.postContainer, data.composerData);
	});

	// ── Hook: composer submit (NodeBB hooks module) ──────────────────────
	// The `filter:composer.submit` hook fires right before the API call and
	// lets us append extra fields to `composerData`.
	require(['hooks'], function (hooks) {
		hooks.on('filter:composer.submit', function (hookData) {
			if (hookData.action === 'topics.post') {
				var selected = hookData.composerEl
					.find('input[name="topic-type"]:checked')
					.val();
				if (selected) {
					hookData.composerData.topicType = selected;
				}
			}
			return hookData;
		});
	});
})();
