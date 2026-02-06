'use strict';

/**
 * Client-side plugin for the Question/Note topic type selector and reply-type (Answer/Comment) for question topics.
 *
 * 1. Injects radio buttons (Question / Note) into the composer when creating a new topic.
 * 2. Reads the selected value and adds `topicType` to the API payload on submit.
 * 3. On question topic pages: injects Answer/Comment selector into quick reply (core quickreply.js reads it and sends replyType).
 * 4. On question topic pages: injects Answer/Comment badges into each post header (no .tpl changes).
 */
(function () {
	// ── HTML for the composer topic type radio group ─────────────────────
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

	// ── HTML for quick reply Answer/Comment selector (question topics only) ─
	var quickReplyTypeHTML = [
		'<div class="quickreply-reply-type d-flex align-items-center gap-2 flex-wrap" data-component="topic/quickreply/reply-type-wrapper">',
		'  <span class="text-muted small">Post as</span>',
		'  <div component="topic/quickreply/reply-type" class="btn-group btn-group-sm" role="group">',
		'    <input type="radio" class="btn-check" name="replyType" id="quickreply-reply-type-answer" value="answer" autocomplete="off">',
		'    <label class="btn btn-outline-primary" for="quickreply-reply-type-answer">Answer</label>',
		'    <input type="radio" class="btn-check" name="replyType" id="quickreply-reply-type-comment" value="comment" autocomplete="off" checked>',
		'    <label class="btn btn-outline-primary" for="quickreply-reply-type-comment">Comment</label>',
		'  </div>',
		'</div>',
	].join('\n');

	// ── Inject topic type radio buttons when the composer opens ───────────
	function injectTopicTypeSelector(postContainer, composerData) {
		if (!composerData || composerData.action !== 'topics.post') {
			return;
		}
		if (postContainer.find('[data-component="composer/topic-type"]').length) {
			return;
		}
		var titleEl = postContainer.find('[data-component="composer/title"]');
		if (titleEl.length) {
			titleEl.after(radioHTML);
		}
	}

	// ── Inject Answer/Comment selector into quick reply (question topics) ─
	function injectQuickReplyTypeSelector() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		var container = document.querySelector('[component="topic/quickreply/container"]');
		if (!container) {
			return;
		}
		if (container.querySelector('[data-component="topic/quickreply/reply-type-wrapper"]')) {
			return;
		}
		var messageDiv = container.querySelector('.quickreply-message');
		if (messageDiv && messageDiv.nextElementSibling) {
			messageDiv.insertAdjacentHTML('afterend', quickReplyTypeHTML);
		} else if (messageDiv) {
			messageDiv.insertAdjacentHTML('afterend', quickReplyTypeHTML);
		}
	}

	// ── Inject Answer/Comment badges into post headers (question topics) ───
	function injectReplyTypeBadges() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		var posts = ajaxify.data.posts;
		if (!Array.isArray(posts)) {
			return;
		}
		posts.forEach(function (post) {
			if (!post || !post.pid || (post.replyType !== 'answer' && post.replyType !== 'comment')) {
				return;
			}
			var postEl = document.querySelector('[component="post"][data-pid="' + post.pid + '"]');
			if (!postEl) {
				return;
			}
			var header = postEl.querySelector('.post-header');
			if (!header) {
				return;
			}
			var firstRow = header.querySelector('.d-flex.gap-1.flex-wrap');
			if (!firstRow) {
				firstRow = header.firstElementChild;
			}
			if (!firstRow) {
				return;
			}
			if (firstRow.querySelector('[data-topic-type-reply-badge]')) {
				return;
			}
			var badge = document.createElement('span');
			badge.setAttribute('data-topic-type-reply-badge', '1');
			badge.className = 'badge rounded-1 me-1 ' + (post.replyType === 'answer' ? 'bg-success' : 'bg-secondary');
			badge.textContent = post.replyType === 'answer' ? 'Answer' : 'Comment';
			firstRow.insertBefore(badge, firstRow.firstChild);
		});
	}

	// ── Run topic-page logic (quick reply selector + badges) ──────────────
	function onTopicPageReady() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || !ajaxify.data.tid) {
			return;
		}
		injectQuickReplyTypeSelector();
		injectReplyTypeBadges();
	}

	// ── Hook: composer loaded ────────────────────────────────────────────
	$(window).on('action:composer.loaded', function (_ev, data) {
		injectTopicTypeSelector(data.postContainer, data.composerData);
	});

	// ── Hook: topic page loaded (inject reply-type selector + badges) ────
	$(window).on('action:ajaxify.end', function () {
		onTopicPageReady();
	});

	// ── Hook: new posts added (e.g. nested replies, new post) ─────────────
	require(['hooks'], function (hooks) {
		hooks.on('action:posts.loaded', function () {
			injectReplyTypeBadges();
		});
		hooks.on('action:quickreply.success', function () {
			setTimeout(injectReplyTypeBadges, 0);
		});

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
