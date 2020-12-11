    const cache = (() => {
        let getTime = function() {
            let timestamp = Date.now();
            timestamp = timestamp.toString();

            let cache_time = Number(localStorage.getItem("cache_time"));

            //if id not set - do it
            if (cache_time == null) {
                localStorage.setItem("cache_time", timestamp);

            } else {
                if (timestamp > (36000000 + cache_time)) {
                    localStorage.setItem("cache_time", timestamp);
                    return true
                } else {
                    return false

                }

            }
        }


        let loadCache = function() {
            return localStorage.getItem(JSON.parse(data));
        }

        let saveCache = function(data) {
            localStorage.setItem("data", JSON.stringify(data));
            //alert(localStorage.getItem("data"))

        }

        return { getTime, saveCache, loadCache };
    })();