import axios from 'axios';
import querystring from 'querystring';
import * as cheerio from 'cheerio';
import qs from 'qs';

const CONFIG = {
    DEFAULT_FEATURES: {
        "responsive_web_graphql_exclude_directive_enabled": true,
        "creator_subscriptions_tweet_preview_api_enabled": true,
        "responsive_web_graphql_timeline_navigation_enabled": true,
        "view_counts_everywhere_api_enabled": true,
        "longform_notetweets_consumption_enabled": true,
        "responsive_web_twitter_article_tweet_consumption_enabled": true,
        "graphql_is_translatable_rweb_tweet_is_translatable_enabled": true,
        "longform_notetweets_rich_text_read_enabled": true,
        "longform_notetweets_inline_media_enabled": true,
    },
    DEFAULT_VARIABLES: {
        "withCommunity": false,
        "includePromotedContent": false,
        "withVoice": false,
        "with_rux_injections": false,
    },
    HEADERS: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    API_OPERATION_ID: 'Vg2Akr5FzUmF0sTplA5k6g',
    MAX_RETRIES: 3,
};

const tokenCache = new Map();

const twitter = {
    extractID: (url) => {
        const match = url.match(/(?<=status[s]?\/)\d+/);
        if (!match) {
            throw new Error(`ga Nemu id, itu url tweet apa bukan?.`);
        }
        return match[0];
    },

    fetchBearer: async (jsUrl) => {
        try {
            const { data: jsData } = await axios.get(jsUrl);
            const match = jsData.match(/:"Bearer ([a-zA-Z0-9%]+)"/);
            if (!match) throw new Error(`token ilang.`);
            return match[1];
        } catch (error) {
            throw new Error("nice try");
        }
    },

    fetchGuestToken: async (htmlContent) => {
        const match = htmlContent.match(/gt=(\d+)/); 
        if (!match) throw new Error(`gt nya gada`);
        return match[1];
    },

    getAuthenticationTokens: async (url) => {
        if (tokenCache.has(url)) {
            return tokenCache.get(url);
        }

        try {
            const { data: pageData } = await axios.get(url, { headers: CONFIG.HEADERS });
            
            const mainJsUrlMatch = pageData.match(/https:\/\/abs.twimg.com\/responsive-web\/client-web-legacy\/main\.[^\.]+\.js/);

            if (!mainJsUrlMatch) {
                throw new Error('js nya gada.');
            }

            const mainJsUrl = mainJsUrlMatch[0];
            const bearerToken = await twitter.fetchBearer(mainJsUrl);
            const guestToken = await twitter.fetchGuestToken(pageData);
            
            const tokens = { bearer: bearerToken, guest: guestToken };
            tokenCache.set(url, tokens);
            return tokens;

        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    },

    generateApiUrl: (tId, features, variables) => {
        const variablesCopy = { ...variables, tweetId: tId };

        const variablesEncoded = querystring.escape(JSON.stringify(variablesCopy));
        const featuresEncoded = querystring.escape(JSON.stringify(features));

        return `https://api.x.com/graphql/${CONFIG.API_OPERATION_ID}/TweetResultByRestId?variables=${variablesEncoded}&features=${featuresEncoded}`;
    },

    updateConfigFromError: (errorData, currentFeatures, currentVariables) => {
        const varPattern = /Variable '([^']+)'/;
        const featPattern = /The following features cannot be null: ([^"]+)/;
        let updated = false;

        errorData?.errors?.forEach(error => {
            if (!error?.message) return;

            const neededVars = error.message.match(varPattern);
            if (neededVars) {
                neededVars.slice(1).forEach(v => { currentVariables[v] = true; updated = true; });
            }

            const neededFeatures = error.message.match(featPattern);
            if (neededFeatures) {
                neededFeatures[1].split(',').forEach(feature => {
                    currentFeatures[feature.trim()] = true;
                    updated = true;
                });
            }
        });

        return updated;
    },

    fetchTweetDetailsWithRetry: async (tweetId, tokens) => {
        let features = { ...CONFIG.DEFAULT_FEATURES };
        let variables = { ...CONFIG.DEFAULT_VARIABLES };
        let details = null;

        for (let retryCount = 0; retryCount < CONFIG.MAX_RETRIES; retryCount++) {
            let url = twitter.generateApiUrl(tweetId, features, variables);

            try {
                const { data, status } = await axios.get(url, {
                    headers: {
                        "Authorization": `Bearer ${tokens.bearer}`,
                        "X-Guest-Token": tokens.guest,
                        'Accept-Encoding': 'gzip, deflate, br', 
                    },
                });

                if (status === 200 && data?.data?.tweetResult?.result) {
                    details = data.data.tweetResult.result;
                    break;
                } else {
                    throw new Error(`status: ${status}.`);
                }

            } catch (error) {
                if (error.response?.status === 400 && error.response.data) {
                    const updated = twitter.updateConfigFromError(error.response.data, features, variables);
                    if (updated && retryCount < CONFIG.MAX_RETRIES - 1) {
                        console.log(`Retry ${retryCount + 1}`);
                        continue;
                    }
                }
                throw error;
            }
        }

        if (!details) {
            throw new Error('data gada udh beberapa kali nyoba.');
        }

        return details;
    },

    cleanseData: (rawData) => {
        const { core, legacy, views } = rawData;

        if (!core || !legacy || !views) {
             throw new Error("data rusak.");
        }
        
        const username = core.user_results.result.legacy.screen_name;
        const textContent = legacy.full_text.replace(/https:\/\/t\.co\/[a-zA-Z0-9_-]+\s*$/, '').trim();
        
        const media = legacy.entities?.media?.map(m => {
            if (m.type === 'video' || m.type === 'animated_gif') {
                const variants = m.video_info?.variants;

                if (variants && variants.length > 0) {
                    const mp4Variants = variants.filter(v => v.bitrate !== undefined && v.content_type.includes('video/mp4'));

                    if (mp4Variants.length > 0) {
                        const highestQuality = mp4Variants.reduce((p, c) => (
                            c.bitrate > p.bitrate ? c : p
                        ), mp4Variants[0]);

                        return {
                            type: m.type === 'video' ? 'video' : 'gif',
                            thumbnail: m.media_url_https,
                            url: highestQuality.url,
                            bitrate: highestQuality.bitrate 
                        };
                    }
                }
                return null;
            } else if (m.type === 'photo') {
                return {
                    type: 'image',
                    url: `${m.media_url_https}?format=jpg&name=large`
                };
            }
            return null;
        }).filter(Boolean) || [];

        return {
            authorUsername: username,
            text: textContent,
            stats: {
                likes: legacy.favorite_count,
                views: views.count,
                retweets: legacy.retweet_count,
            },
            mediaFiles: media,
            sensitive: legacy.possibly_sensitive,
        };
    },
    
    download: async (tweetUrl) => {
        try {
            const tweetId = twitter.extractID(tweetUrl);
            const tokens = await twitter.getAuthenticationTokens(tweetUrl);
            
            const rawDetails = await twitter.fetchTweetDetailsWithRetry(tweetId, tokens);
            
            return twitter.cleanseData(rawDetails);
    
        } catch (error) {
            console.error(`Download Process Failed: ${error.message}`);
            tokenCache.delete(tweetUrl); 
            
            return {
                status: 'failed',
                message: error.message || 'An unknown error occurred during media fetching.'
            };
        }
    }
};

async function getDonghuaUpdate() {
    try {
        let { data } = await axios.get('https://anichin.watch/schedule/')
        const $ = cheerio.load(data)
        let result = []
        let sec = $('.postbody')
        sec.find('.schedulepage').each((i, el) => {
            result.push({
                day: $(el).find('h3').text().trim(),
                donghua: []
            })
            $(el).find('.bs').each((j, ev) => {
                result[i].donghua.push({
                    title: $(ev).find('.tt').text().trim(),
                    img: $(ev).find('img').attr('src'),
                    eps: $(ev).find('.bt .sb').text().trim(),
                    time: $(ev).find('.bt .epx').text().trim(),
                })
            })
        })
        return result
    } catch (e) {
        return e
    }
};

async function asu(url) {
  try {
    const payload = qs.stringify({ fb_url: url })
    const res = await axios.post("https://saveas.co/smart_download.php", payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0"
      }
    })
    const $ = cheerio.load(res.data)
    const thumb = $(".box img").attr("src") || null
    const title = $(".box .info h2").text().trim() || null
    const desc = $(".box .info p").first().text().replace("Description:", "").trim() || null
    const duration = $(".box .info p").last().text().replace("Duration:", "").trim() || null
    const sd = $("#sdLink").attr("href") || null
    const hd = $("#hdLink").attr("href") || null
    return { status: "success", title, desc, duration, thumb, sd, hd }
  } catch (e) {
    return { status: "error", message: e.message }
  }
};


export { twitter, getDonghuaUpdate, asu };