# peertube-plugin-playlist-sort

Adds a **Sort by date (newest first)** button to your playlist page (`My library > Playlists > <playlist>`).

Videos are ordered by their original publication date when set, otherwise by their PeerTube publication date. Unavailable videos are moved to the end.

Requires PeerTube >= 6.0.0.

## Install from path

```sh
peertube-cli plugins install --path /absolute/path/to/peertube-plugin-playlist-sort
```

## Manual install on a server

```sh
npm pack
# copy the .tgz to the server and extract it to /tmp/peertube-plugin-playlist-sort, then:
cd /var/www/peertube/peertube-latest
sudo -u peertube NODE_CONFIG_DIR=/var/www/peertube/config NODE_ENV=production npm run plugin:install -- --plugin-path /tmp/peertube-plugin-playlist-sort
sudo systemctl restart peertube
```
