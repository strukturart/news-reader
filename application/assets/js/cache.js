    const cache = (() => {
        let getTime = function(cache_buffer) {
            let timestamp = Math.floor((new Date()).getTime() / 60000)
            cache_buffer = Number(cache_buffer)
            let lastupdate = Number(localStorage.getItem("last_update"));

            let update_time = cache_buffer + lastupdate
                //alert(timestamp + "/" + lastupdate + "/" + cache_buffer)

            if (lastupdate == null || timestamp > update_time) {
                localStorage.setItem("last_update", timestamp.toString());
                //download
                return true
            } else {
                //cache
                return false
            }

        }



        let loadCache = function() {
            return JSON.parse(localStorage.getItem("data"));
        }

        let saveCache = function(data) {
            localStorage.setItem("data", JSON.stringify(data));
        }

        return { getTime, saveCache, loadCache };
    })();