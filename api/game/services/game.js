'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-services)
 * to customize this service
 */

const axios = require('axios');
const slugify = require('slugify');
const qs = require('querystring');

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function Exception(e) {
  return { e, data: e.data && e.data.errors && e.data.errors };
}

async function getGameInfo(slug) {
  try {
    const jsdom = require('jsdom');
    const { JSDOM } = jsdom;
    const body = await axios.get(`https://www.gog.com/game/${slug}`);
    const dom = new JSDOM(body.data);

    const ratingElement = dom.window.document.querySelector(
      '.age-restrictions__icon use'
    );

    const description = dom.window.document.querySelector('.description');

    const short_description = description.textContent.trim().slice(0, 160);

    return {
      rating: ratingElement
        ? ratingElement
          .getAttribute('xlink:href')
          .split('#')[1]
          .replace(/_/g, "")
        : 'FREE',
      short_description,
      description: description.innerHTML,
    }
  } catch (e) {
    console.error("getGameInfo", Exception(e));
  }
}

async function getByName(name, entityName) {
  try {
    const item = await strapi.services[entityName].find({
      name,
    });

    return item.length ? item[0] : null;
  } catch (e) {
    console.error("getByName", Exception(e));
  }
}

async function create(name, entityName) {
  try {
    const item = await getByName(name, entityName);

    if (!item) {
      return await strapi.services[entityName].create({
        name,
        slug: slugify(name, { lower: true }),
      });
    }
  } catch (e) {
    console.error("create", Exception(e));
  }
}

async function cerateManyToMany(products) {
  try {
    const developers = {};
    const publishers = {};
    const categories = {};
    const platforms = {};

    products.forEach(product => {
      const {
        developer,
        publisher,
        genres,
        supportedOperatingSystems
      } = product;

      genres &&
        genres.forEach(genre => {
          categories[genre] = true;
        });

      supportedOperatingSystems &&
        supportedOperatingSystems.forEach(platform => {
          platforms[platform] = true;
        });

      developers[developer] = true;
      publishers[publisher] = true;
    });

    return Promise.all([
      ...Object.keys(developers).map(name => create(name, 'developer')),
      ...Object.keys(publishers).map(name => create(name, 'publisher')),
      ...Object.keys(categories).map(name => create(name, 'category')),
      ...Object.keys(platforms).map(name => create(name, 'platform')),
    ]);
  } catch (e) {
    console.error("cerateManyToMany", Exception(e));
  }
}

async function setImages({ image, game, field = "cover" }) {
  try {
    const url = `https:${image}_bg_crop_1680x655.jpg`;
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(data, 'base64');

    const FormData = require('form-data');
    const form = new FormData();

    form.append('refId', game.id);
    form.append('ref', 'game');
    form.append('field', field);
    form.append('files', buffer, { filename: `${game.slug}.jpg` });

    console.info(`Uploading ${field} image for ${game.name}...`);

    await axios.post(
      `http://${strapi.config.host}:${strapi.config.port}/upload`,
      form,
      {
        headers: form.getHeaders()
      }
    );
  } catch (e) {
    console.error("setImages", Exception(e));
  }
}

async function createGames(products) {
  try {
    await Promise.all(
      products.map(async product => {
        const item = await getByName(product.title, 'game');

        if (!item) {
          console.info(`Creating game ${product.title}...`);

          const game = await strapi.services.game.create({
            name: product.title,
            slug: product.slug.replace(/_/g, "-"),
            price: product.price.amount,
            release_date: new Date(
              Number(product.globalReleaseDate) * 1000
              ).toISOString(),
            categories: await Promise.all(
              product.genres.map(genre => getByName(genre, 'category'))
            ),
            platforms: await Promise.all(
              product.supportedOperatingSystems.map(platform => getByName(platform, 'platform'))
            ),
            developers: [await getByName(product.developer, 'developer')],
            publisher: await getByName(product.publisher, 'publisher'),
            ...(await getGameInfo(product.slug)),
          });

          await setImages({ image: product.image, game });
          await Promise.all(
            product.gallery
              .slice(0, 5)
              .map(url => setImages({ image: url, game, field: 'gallery' }))
          );

          await timeout(2000);

          return game;
        }
      })
    )
  } catch (e) {
    console.error("createGames", Exception(e));
  }
}

module.exports = {
  populate: async (params) => {
    try {
      const gogApiUrl = `https://www.gog.com/games/ajax/filtered?mediaType=game&${qs.stringify(
        params
      )}`;
      const { data: { products } } = await axios.get(gogApiUrl);
      console.info(`Found ${products.length} games`);

      await cerateManyToMany(products);
      await createGames(products);
    } catch (e) {
      console.error("populate", Exception(e));
    }
  }
};
