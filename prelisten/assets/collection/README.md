# Cassette collection artwork

One folder per release (folder name = `id` in `config.js → collection.albums`).
After adding files, list them in that album's `files` object in config.js.

| key    | what                                  | format / size                         |
|--------|---------------------------------------|---------------------------------------|
| front  | J-card front panel                    | portrait, ~65×102 mm (e.g. 640×1004)  |
| back   | rear J-card panel (seen through base) | portrait, same size                   |
| inside | inner side of the front panel         | portrait, same size (optional)        |
| spine  | J-card spine                          | 102×14.5 mm strip (e.g. 1024×146)     |
| sideA  | shell label, side A                   | 1000×483, reel window 16.7–83.3 % x, 34–85 % y |
| sideB  | shell label, side B                   | same                                  |

PNG / JPG / WebP. Use cassette-edition scans where possible; record each source in the folder's SOURCES.md.
