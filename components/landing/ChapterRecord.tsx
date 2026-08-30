export function ChapterRecord() {
  return (
    <section className="chapter" id="ch2">
      <div className="pin-scene" data-burn-scene>
        <div className="ch-head" data-story-section>
          <div className="kicker" data-reveal-item>
            Chapter Two · The Record
          </div>
          <h2 data-reveal-item>Every burn, remembered.</h2>
          <p className="ch-deck" data-reveal-item>
            Rate every smoke by thirds. Your palate develops a memory, and the Society tracks it
            for you.
          </p>
        </div>

        <div className="burn-stage" data-burn-stage>
          <div className="gcard burn-card">
            <div className="gcard-in" style={{ padding: 26 }}>
              <div className="g-label">
                BURN REPORT <i>№ 214 · TONIGHT</i>
              </div>
              <div className="burn">
                <div className="score">
                  92<small>OF 100</small>
                </div>
                <div>
                  <div className="b-name">Padrón 1964 Anniversary</div>
                  <div className="b-sub">Maduro · Torpedo · paired with rye</div>
                  <p className="b-notes">
                    Espresso and dark cocoa out of the gate, cedar on the retrohale.{" "}
                    <em>Razor burn line to the last third.</em> Worth every week of the wait.
                  </p>
                  <div className="thirds">
                    <span className="third a" />
                    <span className="third b" />
                    <span className="third c" />
                  </div>
                  <div className="third-label">FIRST · SECOND · FINAL THIRD</div>
                </div>
              </div>
            </div>
          </div>

          <div className="gcard burn-card">
            <div className="gcard-in" style={{ padding: 26 }}>
              <div className="g-label">
                BURN REPORT <i>№ 213 · LAST FRIDAY</i>
              </div>
              <div className="burn">
                <div className="score">
                  88<small>OF 100</small>
                </div>
                <div>
                  <div className="b-name">Oliva Serie V Melanio</div>
                  <div className="b-sub">Sumatra · Figurado · paired with cold brew</div>
                  <p className="b-notes">
                    Baking spice and toast, a touch of white pepper in the final third. Needed one
                    relight in the wind, no fault of its own.
                  </p>
                  <div className="thirds">
                    <span className="third a" />
                    <span className="third b" />
                    <span className="third c" />
                  </div>
                  <div className="third-label">FIRST · SECOND · FINAL THIRD</div>
                </div>
              </div>
            </div>
          </div>

          <div className="gcard burn-card">
            <div className="gcard-in" style={{ padding: 26 }}>
              <div className="g-label">
                BURN REPORT <i>№ 212 · THE PORCH</i>
              </div>
              <div className="burn">
                <div className="score">
                  95<small>OF 100</small>
                </div>
                <div>
                  <div className="b-name">Arturo Fuente Hemingway</div>
                  <div className="b-sub">Cameroon · Perfecto · paired with nothing at all</div>
                  <p className="b-notes">
                    Sweet cedar, cream, and a long quiet finish.{" "}
                    <em>The kind of smoke you want to remember.</em> Ninety minutes gone in what
                    felt like ten.
                  </p>
                  <div className="thirds">
                    <span className="third a" />
                    <span className="third b" />
                    <span className="third c" />
                  </div>
                  <div className="third-label">FIRST · SECOND · FINAL THIRD</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
