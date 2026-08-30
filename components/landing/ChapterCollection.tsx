export function ChapterCollection() {
  return (
    <section className="chapter" id="ch1">
      <div className="pin-scene" data-humidor-scene>
        <div className="ch-head" data-story-section>
          <div className="kicker" data-reveal-item>
            Chapter One · The Collection
          </div>
          <h2 data-reveal-item>The humidor, kept like a ledger.</h2>
          <p className="ch-deck" data-reveal-item>
            Every stick logged with its wrapper, vitola, and age. Live cabinet sensors watch the
            humidity while time does its quiet work.
          </p>
        </div>

        <div className="scene-view">
          <div className="scene-copy">
            <div className="step" data-scene-step>
              <div className="step-no">01</div>
              <h3>Age with intent</h3>
              <p>
                Set a resting target per cigar. The shelf tells you what is ready tonight and what
                deserves another season in the dark.
              </p>
            </div>
            <div className="step" data-scene-step>
              <div className="step-no">02</div>
              <h3>Sensors on watch</h3>
              <p>
                Pair your cabinet sensor and monitor each humidor&apos;s temperature and humidity
                in real time.
              </p>
            </div>
            <div className="step" data-scene-step>
              <div className="step-no">03</div>
              <h3>Push notifications</h3>
              <p>
                Get notified when cigars are ready to smoke or when your humidor needs attention,
                and when other users comment on your Lounge posts.
              </p>
            </div>
          </div>

          <div className="scene-stage">
            <div className="phone" data-scene-phone>
              <div className="p-title">
                Humidor <span className="p-count">24 CIGARS · 68% RH</span>
              </div>
              <div className="row">
                <div className="thumb" />
                <div>
                  <div className="r-name">Padrón 1964 Anniversary</div>
                  <div className="r-meta">Maduro · Torpedo · aging 8 mo</div>
                </div>
                <span className="badge">READY</span>
              </div>
              <div className="row">
                <div className="thumb t2" />
                <div>
                  <div className="r-name">Oliva Serie V Melanio</div>
                  <div className="r-meta">Sumatra · Figurado · 3 mo</div>
                </div>
                <span className="badge gold">RESTING</span>
              </div>
              <div className="row">
                <div className="thumb t3" />
                <div>
                  <div className="r-name">Arturo Fuente Hemingway</div>
                  <div className="r-meta">Cameroon · Perfecto · 5 mo</div>
                </div>
                <span className="badge gold">RESTING</span>
              </div>
              <div className="row">
                <div className="thumb" />
                <div>
                  <div className="r-name">Liga Privada No. 9</div>
                  <div className="r-meta">Broadleaf · Toro · 11 mo</div>
                </div>
                <span className="badge">READY</span>
              </div>
            </div>

            <div className="gcard sat sat-env" data-scene-sat>
              <div className="gcard-in">
                <div className="g-label">
                  <span>CABINET SENSOR</span>
                  <i>PAIRED</i>
                </div>
                <div className="env-row">
                  <span className="env-k">Humidity</span>
                  <span className="env-v ok">68% RH</span>
                </div>
                <div className="env-row">
                  <span className="env-k">Temperature</span>
                  <span className="env-v">67.4°F</span>
                </div>
                <div className="env-row">
                  <span className="env-k">Ready tonight</span>
                  <span className="env-v hot">3 cigars</span>
                </div>
              </div>
            </div>

            <div className="gcard sat sat-age" data-scene-sat>
              <div className="gcard-in">
                <div className="g-label">AGING ALERT</div>
                <div className="age-name">Padrón 1964 Anniversary</div>
                <div className="age-bar">
                  <i style={{ width: "96%" }} />
                </div>
                <div className="age-meta">8 MO OF 8 MO TARGET · READY NOW</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
