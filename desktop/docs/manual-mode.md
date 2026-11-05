# Manual writing mode

Open a new or existing paper project, then choose 手搓模式 in 写作方式. Write the manuscript in the existing LaTeX editor and compile it in the existing PDF pane. Switching to this mode opens both panes. The previous agent writing workflow remains available when switching back.

Add the author's own outline items (section, theorem, lemma, proof step), associate a project-relative source path and line, and mark each item todo, draft, needs checking, or author-confirmed. These are human progress labels: the reviewer does not set them or generate manuscript text. Outline and review metadata use the project's portable .mps storage. Legacy local records are retained for controlled migration; syncing project files is a separate user-managed task.

The review record has exactly three entry points: language/exposition, proof logic/citation applicability, and calculations. Explicit review saves pending edits first, then captures UTF-8 .tex/.bib/.sty/.cls files in the project, skipping hidden directories, environments and build directories. There is a 2 MB aggregate limit. Keep historical source archives outside an active paper project when they would make the review ambiguous or exceed this limit. PDFs and external cited papers are not supplied; their unverified applicability must be reported as unable to assess. Calculation reviews use reasoning over the supplied text and do not execute computation tools.

A new ephemeral review thread uses an empty private cwd, read-only filesystem sandbox, disabled shell/app tools, disabled inherited MCP servers/plugins, disabled web search, and approvalPolicy=never. The backend checks the returned sandbox and policy before submitting a model turn. Every interactive request from the review thread is rejected. The legacy send and steer endpoints reject manual-mode projects at the backend; frontend write actions are also hidden/blocked. There is no Apply repair action.

Each record retains the original source map, revision digest, time, category, outcome, findings, separate unverified repair proposals, and raw response. Malformed responses become unable-to-assess. Unsuccessful or cancelled runs are not presented as completed reviews. A changed source or unsaved edit makes the previous result stale and disables its source jump. Restarted unfinished runs are interrupted. Concurrent review starts and mode changes during a live review are rejected; cancellation interrupts only that review. A timed-out start retains its reservation because its outcome may be uncertain.

No issue found is not certification of correctness. Author-confirmed outline status is independent of reviewer findings. The author manually decides whether and how to incorporate a suggestion.

Use an isolated test build and synthetic project for acceptance checks. Do not replace an installed application or alter an author project without authorization.
