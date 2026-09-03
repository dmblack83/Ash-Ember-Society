export function ChapterDevices() {
  return (
    <section className="chapter" id="ch4">
      <div className="ch-head" data-story-section>
        <div className="kicker" data-reveal-item>
          Chapter Four · Every Device
        </div>
        <h2 data-reveal-item>One society, every screen.</h2>
        <p className="ch-deck" data-reveal-item>
          Ash &amp; Ember is a progressive web app. Open it in your browser or add it to your home
          screen, and it runs like a native app on laptop, iPhone, and Android. No app store
          needed.
        </p>
      </div>

      <div className="device-row" data-device-row>
        <figure className="device dev-iphone">
          <div className="if-shell">
            <div className="dev-screen">
              <img
                src="/landing/device-iphone.webp"
                alt=""
                width={780}
                height={1688}
                loading="lazy"
                decoding="async"
              />
              <i className="if-island" />
            </div>
          </div>
          <figcaption>
            <b>iOS</b>
            <span>Shared to Home Screen</span>
          </figcaption>
        </figure>

        <figure className="device dev-laptop">
          <div className="mb-shell">
            <div className="mb-screen">
              <i className="mb-notch" />
              <div className="dev-screen">
                <img
                  src="/landing/device-laptop.webp"
                  alt=""
                  width={1600}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
            <div className="mb-base" />
          </div>
          <figcaption>
            <b>LAPTOP</b>
            <span>In the Browser</span>
          </figcaption>
        </figure>

        <figure className="device dev-android">
          <div className="an-shell">
            <div className="dev-screen">
              <img
                src="/landing/device-android.webp"
                alt=""
                width={824}
                height={1830}
                loading="lazy"
                decoding="async"
              />
              <i className="an-punch" />
            </div>
          </div>
          <figcaption>
            <b>ANDROID</b>
            <span>Shared to Home Screen</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
