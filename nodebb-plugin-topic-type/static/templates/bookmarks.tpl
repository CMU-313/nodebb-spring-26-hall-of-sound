{{{ if config.theme.enableBreadcrumbs }}}
<!-- IMPORT partials/breadcrumbs.tpl -->
{{{ end }}}

<div class="bookmarks-page">
	<h1 class="tracking-tight fs-2 fw-semibold mb-3">{title}</h1>

	{{{ if !topics.length }}}
	<p class="text-muted">No bookmarked topics.</p>
	{{{ end }}}

	{{{ if topics.length }}}
	<ul class="list-unstyled mb-0">
		{{{ each topics }}}
		<li class="border-bottom py-3 d-flex flex-column gap-1">
			<a href="{config.relative_path}/topic/{./tid}/{./slug}" class="fw-semibold text-decoration-none" data-ajaxify="false">{./title}</a>
			<span class="text-muted small">
				{{{ if ./category }}}
				<a href="{config.relative_path}/category/{./category.cid}/{./category.slug}" class="text-muted" data-ajaxify="false">{./category.name}</a>
				{{{ end }}}
				{{{ if ./user }}} · {./user.username}{{{ end }}}
			</span>
		</li>
		{{{ end }}}
	</ul>

	{{{ if pagination.pageCount > 1 }}}
	<nav class="mt-3 d-flex gap-2 align-items-center flex-wrap" aria-label="Pagination">
		<span class="small text-muted">Page {pagination.page} of {pagination.pageCount} ({pagination.total} total)</span>
		{{{ if pagination.page > 1 }}}
		<a href="{config.relative_path}/bookmarks?page={pagination.prev}" class="btn btn-sm btn-ghost" data-ajaxify="false">Previous</a>
		{{{ end }}}
		{{{ if pagination.page < pagination.pageCount }}}
		<a href="{config.relative_path}/bookmarks?page={pagination.next}" class="btn btn-sm btn-ghost" data-ajaxify="false">Next</a>
		{{{ end }}}
	</nav>
	{{{ end }}}
	{{{ end }}}
</div>
