export function ChapterCompany() {
  return (
    <section className="chapter" id="ch3">
      <div className="ch-head" data-story-section>
        <div className="kicker" data-reveal-item>
          Chapter Three · The Company
        </div>
        <h2 data-reveal-item>A lounge with no velvet rope.</h2>
        <p className="ch-deck" data-reveal-item>
          One feed, every member. Trade burn reports, argue about wrappers, and welcome the new
          Society members.
        </p>
      </div>

      <div className="lounge-grid" data-story-section>
        <div className="gcard" data-reveal-item>
          <div className="gcard-in">
            <div className="g-label">THE LOUNGE</div>
            <p className="l-post">
              &quot;Eight months on the &apos;64 and it finally opened up. Worth every week of
              waiting.&quot;
            </p>
            <div className="l-meta">
              <span className="avatar" /> MEMBER
            </div>
          </div>
        </div>
        <div className="gcard" data-reveal-item>
          <div className="gcard-in">
            <div className="g-label">THE LOUNGE</div>
            <p className="l-post">
              &quot;Hot take: Cameroon is the most underrated wrapper in the game and it is not
              close.&quot;
            </p>
            <div className="l-meta">
              <span className="avatar a2" /> MEMBER
            </div>
          </div>
        </div>
        <div className="gcard" data-reveal-item>
          <div className="gcard-in">
            <div className="g-label">THE LOUNGE</div>
            <p className="l-post">
              &quot;First burn report in the books. Went with a Hemingway Short Story on the
              advice of this feed. You people were right.&quot;
            </p>
            <div className="l-meta">
              <span className="avatar a3" /> MEMBER
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
