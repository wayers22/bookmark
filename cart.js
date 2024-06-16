window.gibinit = function() {
  if (typeof window.gibSettings != 'undefined') {
    console.warn('GIB Already exists... Exiting');
    return false;
  }

  function detectUPC() {
    if (window.gibRetailer == 'target') {
      var upcMatches = location.pathname.match(/(A-\d{8})/);
      var onlyUpc = location.pathname.match(/(\d{8})/);
      if (upcMatches) {
        var upc1 = upcMatches[0].split('-')[1];
        var upc2 = onlyUpc[0];
        if (upc1 == upc2) return upc1;
      }
    } else if (window.gibRetailer == 'gamestop') {
      var meta = gamestopProductMeta();
      if (!meta) return null;
      return meta.productInfo.sku;
    }
    return null;
  }

  function detectProductName() {
    if (window.gibRetailer == 'target') {
      var productHeading = document.querySelector('h1');
      if (!productHeading) return 'UNKNOWN PRODUCT';
      return productHeading.textContent;
    } else if (window.gibRetailer == 'gamestop') {
      var meta = gamestopProductMeta();
      if (!meta) return '';
      return meta.productInfo.name;
    }
    return '';
  }

  function target_addToCart(DEBUG_NODE, UPC) {
    var cartUrl = 'https://carts.target.com/web_checkouts/v1/cart_items?field_groups=CART%2CCART_ITEMS%2CSUMMARY&key=feaf228eb2777fd3eee0fd5192ae7107d6224b39';
    var cart = {"cart_type":"REGULAR","channel_id":"10","shopping_context":"DIGITAL","cart_item":{"tcin":UPC,"quantity":12,"item_channel_id":"10"},"fulfillment":{"fulfillment_test_mode":"grocery_opu_team_member_test"}};
    
    DEBUG_NODE.innerText = 'Carting...';

    fetch(cartUrl, { 
      method: 'POST', 
      mode: 'cors', 
      credentials: 'include', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(cart) 
    }).then(function(response) {
      window.gibAttempts++;
      if (response.status >= 200 && response.status < 300) return response;
      else if (response.status === 401) return 'AUTH';
      else throw new Error('Failed to add to cart');
    }).then(function(response) {
      if (!response) {
        DEBUG_NODE.innerText = 'Status: FAILED... Attempt #' + window.gibAttempts;
        retryOrStop(DEBUG_NODE, UPC); // Retry on failure
        return;
      }

      if (response === 'AUTH') {
        DEBUG_NODE.innerText = 'CRITICAL ERROR... Refresh this page and reactivate product watcher to continue...';
        window.gibWatcherDisable();
        window.gibSoundTrigger(4, true);
      } else {
        window.gibSoundTrigger(0, true);
        window.gibWatcherDisable();
        window.location.replace('https://www.target.com/co-review?precheckout=true');
      }
    }).catch(function(error) {
      DEBUG_NODE.innerText = 'Error: ' + error.message;
      retryOrStop(DEBUG_NODE, UPC); // Retry on error
    });

    function retryOrStop(DEBUG_NODE, UPC) {
      if (window.gibAttempts < 3) {
        DEBUG_NODE.innerText = 'Retrying... Attempt #' + window.gibAttempts;
        setTimeout(function() {
          target_addToCart(DEBUG_NODE, UPC); // Retry after a delay
        }, 3000); // 3 seconds delay before retrying
      } else {
        DEBUG_NODE.innerText = 'Exceeded retry limit, stopping watcher...';
        window.gibWatcherDisable();
        window.gibSoundTrigger(5, true);
      }
    }
  }

  // -1 = loop until cancelled
  //  0 || undefined = trigger once
  //  1+ = how many seconds
  function triggerSound(duration, override) {
    if (typeof override == 'undefined') override = false;
    if (typeof duration == 'undefined') duration = 0;
    if (!window.gibSoundLoaded) return !!console.warn('Sounds not loaded');
    if (!window.gibSettings.alerts && !override) return !!console.warn('Alerts not enabled');
    if (window.gibSoundLoopSource) return !!console.warn('Sound already in progress');

    var source = window.gibSoundContext.createBufferSource();
    source.buffer = window.gibSoundBuffer;
    var volume = window.gibSoundContext.createGain();
    volume.gain.value = 1;
    volume.connect(window.gibSoundContext.destination);
    source.connect(volume);

    if (duration == -1 || duration > 0) {
      source.loop = true;
      window.gibSoundLoopSource = source;

      if (duration > 0) {
        setTimeout(window.gibStopSound, (duration * 1000));
      }
    }

    source.start(0);
  }

  function stopSound() {
    if (!window.gibSoundLoaded) return !!console.warn('Sounds not loaded');
    if (!window.gibSoundLoopSource) return !!console.warn('Sound not in progress');

    try {
      window.gibSoundLoopSource.stop();
      window.gibSoundLoopSource = null;
    } catch (err) {}
  }

  function startWatcher(GIB, DEBUG_NODE) {
    if (!window.gibSupportedSites.includes(window.gibRetailer)) {
      DEBUG_NODE.innerText = 'Retailer not supported!';
      window.gibWatcherDisable();
      window.gibSoundTrigger(5, true);
      return false;
    }

    if (!GIB.PRODUCT_UPC || GIB.PRODUCT_UPC.length == 0) {
      DEBUG_NODE.innerText = 'CRITICAL ERROR, ACCOUNT POSSIBLY LOCKED.';
      window.gibWatcherDisable();
      window.gibSoundTrigger(5, true);
      return false;
    }

    DEBUG_NODE.innerText = 'Starting Watcher';

    clearInterval(window.gibTimerId);
    window.gibSettings.enabled = true;
    window.gibAttemptSecondsLeft = GIB.refreshSeconds;

    setTimeout(function() {
      GIB.addToCart(DEBUG_NODE, GIB.PRODUCT_UPC);

      window.gibTimerId = setInterval(function() {
        if (!window.gibSettings.enabled) {
          console.log('GIB Disabled...');
          return;
        }

        window.gibAttemptSecondsLeft--;

        if (window.gibRetryCountdownNow <= 0) {
          DEBUG_NODE.innerText = 'Attempt #' + window.gibAttempts + '... Retrying in ' + window.gibAttemptSecondsLeft + ' second(s)...';
        }

        if (window.gibAttemptSecondsLeft <= 0) {
          window.gibAttemptSecondsLeft = GIB.refreshSeconds;
          GIB.addToCart(DEBUG_NODE, GIB.PRODUCT_UPC);
        }
      }, 1000);
    }, 1000);
  }

  function stopWatcher(DEBUG_NODE) {
    if (DEBUG_NODE) DEBUG_NODE.innerText = 'Stopping Watcher';
    window.gibSettings.enabled = false;
    clearInterval(window.gibTimerId);
    if (DEBUG_NODE) DEBUG_NODE.innerText = 'Watcher DISABLED';
  }

  window.gibSupportedSites = ['target'];
  window.gibSoundContext = new AudioContext();
  window.gibSoundLoopSource = null;
  window.gibSoundBuffer = null;
  window.gibSoundLoaded = false;

  window.gibAttemptSecondsLeft = 0;
  window.gibRetryCountdownMAX = 2; // minutes
  window.gibRetryCountdownNow = 0;

  window.gibAttempts = 0;
  window.gibTimerId = null;
  window.gibVerified = -5;
  window.gibSettings = {
    alerts: true,
    enabled: true
  };

  var gib = {
    GIB_VERSION: '2.1',
    PRODUCT_UPC: detectUPC(),
    PRODUCT_TITLE: detectProductName(),

    createElement: function(tag, id, styles) {
      var node = document.createElement(tag);
      if (id) node.id = id;
      if (!styles) return node;
      for (var style in styles) {
        node.style[style] = styles[style];
      }
      return node;
    },

    insertStyles: function(styles) {
      var sheet = document.createElement('style');
      sheet.type = 'text/css';
      sheet.innerText = styles;
      document.head.appendChild(sheet);
    },

    addToCart: function(DEBUG_NODE, UPC) {
      if (window.gibRetailer == 'target') {
        window.gibAddToCartTarget(DEBUG_NODE, UPC);
      } else if (window.gibRetailer == 'gamestop') {
        window.gibAddToCartGameStop(DEBUG_NODE, UPC);
      }
    },

    createSettings: function(options) {
      var list = this.createElement('ul', 'gib--settings');
      for (var id in options) {
        var option = options[id];
        var optionWrapper = this.createElement('li', null, {
          marginBottom: '5px'
        });

        var toggle = this.createElement('input');
        toggle.type = 'checkbox';
        toggle.id = option['id'];
        toggle.onclick = option['click'];
        toggle.checked = option['checked'];

        var label = this.createElement('label');
        label.htmlFor = option['id'];

        var span = this.createElement('span', null, {
          color: '#fff',
          paddingLeft: '7px'
        });
        span.innerText = option['label'];

        label.appendChild(toggle);
        label.appendChild(span);
        optionWrapper.appendChild(label);
        list.appendChild(optionWrapper);
      }
      return list;
    }
  };

  var gibStyles = "#gib input[type='checkbox'] { cursor: pointer; position: relative; } #gib input[type='checkbox']::before { content: ''; height: 25px; width: 25px; background-color: #fff; left: -10px; top: -6px; position: absolute; border-radius: 50%; } #gib input[type='checkbox']:checked::after { content: ''; height: 19px; width: 19px; background-color: #4face0; position: absolute; top: -3px; left: -7px; border-radius: 50%; }";

  var wrapper = gib.createElement('div', 'gib', {
    backgroundColor: window.gibRetailer == 'target' ? 'rgba(0, 129, 56, 0.8)' : 'rgba(0,0,0,0.9)',
    position: 'fixed',
    top: '0px',
    zIndex: 99999,
    minHeight: '150px',
    width: '300px',
    padding: '15px',
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'column',
    justifyContent: 'center',
    borderRadius: '25% 0 25% 0%'
  });

  var version = gib.createElement('span', 'gib--version', {
    position: 'absolute',
    top: '7px',
    right: '7px',
    color: '#fff',
    fontSize: '10px'
  });
  version.innerText = 'w33zy version: ' + gib.GIB_VERSION;
  wrapper.appendChild(version);

  var title = gib.createElement('h1', 'gib--title', {
    color: '#fff',
    fontSize: '14px',
    marginBottom: '10px',
    marginTop: '10px'
  });
  title.innerText = gib.PRODUCT_TITLE;
  wrapper.appendChild(title);

  var debug = gib.createElement('div', 'gib--debug', {
    fontSize: '12px',
    color: '#fff',
    marginBottom: '5px',
    lineHeight: '1.1em'
  });
  debug.innerText = 'Setting up DISC Watcher';
  wrapper.appendChild(debug);

  var gibOptions = [

  ];
  var settingsNode = gib.createSettings(gibOptions);
  wrapper.appendChild(settingsNode);

  gib.insertStyles(gibStyles);
  document.body.appendChild(wrapper);

  window.gibAddToCartTarget = target_addToCart;
  window.gibAddToCartGameStop = gamestop_addToCart;

  window.gibWatcherEnable = startWatcher;
  window.gibWatcherDisable = stopWatcher;

  window.gibSoundTrigger = triggerSound;
  window.gibStopSound = stopSound;

  window.gibVerifyUser = function() {
    window.gibVerified++;
    console.log('Verified user %i', window.gibVerified);
    window.gibStopSound();
    if (window.gibVerified < 0) {
      document.getElementById('gib--debug').innerText = 'ALMOST VERIFIED! Click this page a few more times! Will retry in ' + window.gibRetryCountdownNow + ' minute(s)';
      return;
    }

    document.getElementById('gib--debug').innerText = 'VERIFIED! Will restart watcher in ' + window.gibRetryCountdownNow + ' minute(s)';
    removeEventListener('click', window.gibVerifyUser, false);
  };
  loadSound();
  startWatcher(gib, debug);
};
