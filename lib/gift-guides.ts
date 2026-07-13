import { sql } from 'drizzle-orm';
import { db } from './db/index';
import { products } from './db/schema';
import { cleanImageUrl } from './image-utils';
import type { Product } from './types';

export interface GiftGuideDefinition {
  slug: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  keywords: string[];
}

// A guide's broad keywords are useful for recall, but they are not all equally
// distinctive. These focus groups define the concrete evidence that should be
// present in the merchant title before a product leads a guide. Every group
// must match; terms within a group are alternatives. Keeping this separate
// from generated catalog copy prevents optimistic enrichment from making the
// same generic products lead dozens of pages.
const giftGuideFocusKeywordGroups: Record<string, string[][]> = {
  'white-elephant-gifts': [['white elephant']],
  'funny-gifts-for-coworkers': [['coworker', 'coworkers']],
  'funny-gifts-for-dads': [['dad', 'father', 'grandpa']],
  'weird-kitchen-gadgets': [['kitchen gadget', 'kitchen tool', 'kitchen utensil', 'ramen']],
  'novelty-desk-toys': [['desk toy', 'desktop toy', 'fidget']],
  'secret-santa-gag-gifts': [['secret santa']],
  'dirty-santa-gifts': [['dirty santa']],
  'funny-gifts-for-dads-who-fish': [['fish', 'fishing', 'tackle']],
  'cat-lover-gag-gifts': [['cat', 'cats', 'kitten', 'kitty']],
  'dog-lover-gag-gifts': [['dog', 'dogs', 'puppy', 'canine']],
  'prank-gifts-for-friends': [['prank', 'fake']],
  'funny-birthday-gag-gifts': [['birthday']],
  'funny-retirement-gifts': [['retirement', 'retired', 'retiree']],
  'funny-gifts-for-bosses': [['boss', 'manager']],
  'office-prank-gifts': [['office', 'coworker', 'workplace'], ['prank']],
  'funny-coffee-mugs': [['coffee'], ['mug', 'cup', 'tumbler']],
  'weird-bathroom-gifts': [['bathroom', 'toilet', 'restroom']],
  'funny-poop-gifts': [['poop', 'fart', 'potty', 'shart', 'turd']],
  'funny-housewarming-gifts': [['housewarming', 'new home']],
  'funny-stocking-stuffers': [['stocking stuffer', 'stocking stuffers']],
  'white-elephant-gifts-for-adults': [['white elephant'], ['adult', 'adults', 'men', 'women']],
  'gifts-for-people-who-have-everything': [['have everything', 'has everything', 'hard to shop']],
  'funny-gifts-for-men': [['men', 'man', 'husband', 'boyfriend']],
  'funny-gifts-for-women': [['women', 'woman', 'wife', 'girlfriend']],
  'sarcastic-gifts': [['sarcastic', 'snark', 'snarky']],
  'funny-cooking-gifts': [['cooking', 'cook', 'chef']],
  'weird-home-decor-gifts': [['home decor', 'house decor', 'room decor', 'wall decor']],
  'optical-illusion-decor-gifts': [['optical illusion', 'illusion']],
  'funny-gifts-for-teachers': [['teacher', 'school', 'classroom']],
  'funny-gifts-for-nurses': [['nurse', 'nurses', 'nursing']],
  'funny-book-lover-gifts': [['book lover', 'bookish', 'reader', 'reading']],
  'funny-sports-fan-gifts': [['sports fan', 'game day', 'football fan', 'soccer fan', 'baseball fan', 'basketball fan']],
  'funny-wine-gifts': [['wine']],
  'funny-bath-gifts': [['bath', 'spa'], ['bath bomb', 'soap', 'self care', 'relaxation', 'shower']],
  'adult-coloring-book-gifts': [['coloring book', 'colouring book']],
  'funny-halloween-gifts': [['halloween', 'spooky', 'horror']],
  'funny-christmas-gifts': [['christmas']],
  'funny-valentines-gifts': [['valentine', 'valentines']],
  'funny-gifts-for-moms': [['mom', 'mother', 'mama']],
  'funny-gifts-for-gamers': [['gamer', 'gaming', 'video game', 'controller']],
  'funny-golf-gifts': [['golf', 'golfer']],
  'funny-gardening-gifts': [['garden', 'gardening', 'gardener', 'plant lover']],
  'funny-hostess-gifts': [['hostess', 'host gift', 'host gifts', 'party host']],
};

const MIN_FOCUSED_GUIDE_PRODUCTS = 6;

export const giftGuides: GiftGuideDefinition[] = [
  {
    slug: 'white-elephant-gifts',
    title: 'Funny White Elephant Gifts',
    h1: 'Funny white elephant gifts that actually get picked',
    description: 'Browse funny white elephant gifts, party exchange ideas, and weird novelty products with real images and current affiliate links.',
    intro: 'A fast shortlist for gift exchanges where the goal is funny, useful, and just strange enough to get stolen twice.',
    keywords: ['white elephant', 'secret santa', 'party', 'exchange', 'holiday', 'funny', 'gag'],
  },
  {
    slug: 'funny-gifts-for-coworkers',
    title: 'Funny Gifts for Coworkers',
    h1: 'Funny gifts for coworkers that stay office-safe',
    description: 'Find funny gifts for coworkers, desk toys, meeting jokes, and office-safe gag gifts from the goose.gifts catalog.',
    intro: 'Office gifts need a narrow lane: funny enough to land, safe enough to hand over in daylight, and useful enough to avoid the junk drawer.',
    keywords: ['coworker', 'office', 'desk', 'boss', 'meeting', 'work', 'safe'],
  },
  {
    slug: 'funny-gifts-for-dads',
    title: 'Funny Gifts for Dads',
    h1: 'Funny gifts for dads, grandpas, and proud pun collectors',
    description: 'Shop funny dad gifts, grandpa gag gifts, punny finds, and practical novelty products with real catalog items.',
    intro: 'For dads who already own the socks, the mug, and the opinion about the thermostat. These skew practical, punny, and proudly unnecessary.',
    keywords: ['dad', 'father', 'grandpa', 'pun', 'joke', 'gadget', 'grill'],
  },
  {
    slug: 'weird-kitchen-gadgets',
    title: 'Weird Kitchen Gadgets',
    h1: 'Weird kitchen gadgets for cooks with a sense of humor',
    description: 'Browse weird kitchen gadgets, funny mugs, cooking oddities, and novelty food gifts from the goose.gifts catalog.',
    intro: 'Kitchen gifts work best when they are useful at least once and funny every time they come out of a drawer.',
    keywords: ['kitchen', 'cook', 'cooking', 'mug', 'coffee', 'ramen', 'food'],
  },
  {
    slug: 'novelty-desk-toys',
    title: 'Novelty Desk Toys',
    h1: 'Novelty desk toys for bored hands and bad meetings',
    description: 'Find novelty desk toys, office gadgets, fidgets, and small funny gifts for workspaces and home offices.',
    intro: 'Small desk gifts earn their spot by being glanceable, fiddly, and just distracting enough between calls.',
    keywords: ['desk', 'toy', 'office', 'fidget', 'work', 'meeting', 'gadget'],
  },
  {
    slug: 'secret-santa-gag-gifts',
    title: 'Secret Santa Gag Gifts',
    h1: 'Secret Santa gag gifts that are funny without being risky',
    description: 'Find Secret Santa gag gifts, office exchange ideas, and funny holiday presents from the goose.gifts catalog.',
    intro: 'Secret Santa gifts need to be quick to understand, easy to wrap, and funny enough for the room without creating cleanup afterward.',
    keywords: ['secret santa', 'holiday', 'christmas', 'office-safe', 'coworker', 'party', 'gag'],
  },
  {
    slug: 'dirty-santa-gifts',
    title: 'Dirty Santa Gifts',
    h1: 'Dirty Santa gifts built for steals, laughs, and instant reactions',
    description: 'Browse Dirty Santa gifts, holiday exchange gag gifts, and weird novelty products with real catalog items.',
    intro: 'Dirty Santa works best when the gift is obvious from across the room and just tempting enough to get stolen.',
    keywords: ['dirty santa', 'white elephant', 'holiday', 'christmas', 'party', 'exchange', 'gag'],
  },
  {
    slug: 'funny-gifts-for-dads-who-fish',
    title: 'Funny Gifts for Dads Who Fish',
    h1: 'Funny gifts for dads who fish, tinker, and already own enough gear',
    description: 'Shop funny fishing dad gifts, practical gag gifts, and oddball finds for dads who already have the basics.',
    intro: 'For the dad who has a tackle box, a favorite chair, and a story about the one that got away. These lean practical, punny, and easy to hand over.',
    keywords: ['dad', 'father', 'fishing', 'fish', 'tackle', 'outdoor', 'gadget', 'joke'],
  },
  {
    slug: 'cat-lover-gag-gifts',
    title: 'Cat Lover Gag Gifts',
    h1: 'Cat lover gag gifts for people with very specific taste',
    description: 'Find funny cat gifts, cat lover gag gifts, and oddball pet-themed products from the goose.gifts catalog.',
    intro: 'Cat people appreciate specificity. The best gag gift feels like it was chosen by someone who knows the exact household dynamic.',
    keywords: ['cat', 'cats', 'cat-lovers', 'pet', 'pets', 'book', 'coffee', 'gag'],
  },
  {
    slug: 'dog-lover-gag-gifts',
    title: 'Dog Lover Gag Gifts',
    h1: 'Dog lover gag gifts for proud pet people',
    description: 'Browse funny dog gifts, dog dad and dog mom finds, pet gag gifts, and silly catalog picks.',
    intro: 'Dog gifts can be sweet, practical, or completely unnecessary. The best ones make the owner laugh before the dog investigates.',
    keywords: ['dog', 'dogs', 'dog-lovers', 'pet', 'pets', 'dad', 'mom', 'treat'],
  },
  {
    slug: 'prank-gifts-for-friends',
    title: 'Prank Gifts for Friends',
    h1: 'Prank gifts for friends who can take the joke',
    description: 'Find prank gifts for friends, fake product boxes, gag accessories, and funny surprise gifts with real links.',
    intro: 'A good prank gift should land quickly and still leave the recipient with something worth keeping, hiding, or telling people about.',
    keywords: ['prank', 'fake', 'friend', 'friends', 'gag', 'joke', 'surprise', 'party'],
  },
  {
    slug: 'funny-birthday-gag-gifts',
    title: 'Funny Birthday Gag Gifts',
    h1: 'Funny birthday gag gifts that beat another generic card',
    description: 'Shop funny birthday gag gifts, joke presents, novelty candles, and silly surprise ideas.',
    intro: 'Birthday gag gifts work when they feel personal enough to be intentional and ridiculous enough to earn a photo.',
    keywords: ['birthday', 'gag', 'joke', 'candle', 'friend', 'dad', 'mom', 'party'],
  },
  {
    slug: 'funny-retirement-gifts',
    title: 'Funny Retirement Gifts',
    h1: 'Funny retirement gifts for the newly unbothered',
    description: 'Browse funny retirement gifts, coworker farewell gifts, office-safe gag gifts, and novelty keepsakes.',
    intro: 'Retirement gifts should celebrate the escape without turning into a plaque nobody knows where to put.',
    keywords: ['retirement', 'retired', 'coworker', 'office', 'boss', 'work', 'sarcastic', 'gag'],
  },
  {
    slug: 'funny-gifts-for-bosses',
    title: 'Funny Gifts for Bosses',
    h1: 'Funny gifts for bosses that still feel safe to hand over',
    description: 'Find funny boss gifts, office-safe gag gifts, desk finds, and meeting-friendly novelty products.',
    intro: 'The boss gift lane is narrow: funny, useful, and extremely unlikely to require an apology.',
    keywords: ['boss', 'office', 'meeting', 'work', 'desk', 'coworker', 'office-safe', 'safe'],
  },
  {
    slug: 'office-prank-gifts',
    title: 'Office Prank Gifts',
    h1: 'Office prank gifts that stay on the safe side of chaos',
    description: 'Browse office prank gifts, desk jokes, coworker gag gifts, and small workplace-friendly surprises.',
    intro: 'Office prank gifts should be funny at a glance, easy to clean up, and safe enough for shared spaces.',
    keywords: ['office', 'prank', 'desk', 'coworker', 'meeting', 'work', 'safe', 'gag'],
  },
  {
    slug: 'funny-coffee-mugs',
    title: 'Funny Coffee Mugs',
    h1: 'Funny coffee mugs and caffeine-adjacent gifts',
    description: 'Find funny coffee mugs, coffee lover gag gifts, kitchen oddities, and practical novelty drinkware.',
    intro: 'A good mug gift earns counter space by being useful before 9 a.m. and funny after the second sip.',
    keywords: ['coffee', 'mug', 'kitchen', 'drink', 'coworker', 'office', 'dad', 'funny'],
  },
  {
    slug: 'weird-bathroom-gifts',
    title: 'Weird Bathroom Gifts',
    h1: 'Weird bathroom gifts for remodels, housewarmings, and bad taste jokes',
    description: 'Browse weird bathroom gifts, bath gag gifts, novelty decor, and funny housewarming finds.',
    intro: 'Bathroom gifts are where useful, decorative, and deeply unserious all overlap. That makes them perfect for the right recipient.',
    keywords: ['bathroom', 'bath', 'toilet', 'spa', 'housewarming', 'home', 'decor', 'weird'],
  },
  {
    slug: 'funny-poop-gifts',
    title: 'Funny Poop Gifts',
    h1: 'Funny poop gifts for people who think bathroom humor still works',
    description: 'Browse funny poop gifts, toilet jokes, bathroom gag gifts, fart pranks, and ridiculous potty-humor products from the goose.gifts catalog.',
    intro: 'Poop gifts are not subtle, which is exactly the point. These picks work for white elephant exchanges, prank-loving friends, and anyone whose sense of humor never fully grew up.',
    keywords: ['poop', 'toilet', 'bathroom', 'fart', 'potty', 'shart', 'prank', 'gag'],
  },
  {
    slug: 'funny-housewarming-gifts',
    title: 'Funny Housewarming Gifts',
    h1: 'Funny housewarming gifts for people with enough normal candles',
    description: 'Find funny housewarming gifts, weird home decor, novelty kitchen gifts, and practical gag finds.',
    intro: 'Housewarming gifts should survive the party and still make sense on a shelf, counter, or drawer a week later.',
    keywords: ['housewarming', 'home', 'decor', 'kitchen', 'candle', 'bath', 'novelty', 'gag'],
  },
  {
    slug: 'funny-stocking-stuffers',
    title: 'Funny Stocking Stuffers',
    h1: 'Funny stocking stuffers small enough to be dangerous',
    description: 'Browse funny stocking stuffers, small gag gifts, holiday novelty products, and weird little finds.',
    intro: 'Stocking stuffers should be small, fast, and more memorable than their size suggests.',
    keywords: ['stocking', 'stuffer', 'holiday', 'christmas', 'small', 'gag', 'prank', 'funny'],
  },
  {
    slug: 'white-elephant-gifts-for-adults',
    title: 'White Elephant Gifts for Adults',
    h1: 'White elephant gifts for adults who want the room to react',
    description: 'Find white elephant gifts for adults, funny party exchange ideas, and weird gag products.',
    intro: 'Adult gift exchanges reward gifts that are clear, funny, and just useful enough to keep after the laugh.',
    keywords: ['white elephant', 'adult', 'adults', 'party', 'exchange', 'gag', 'weird', 'funny'],
  },
  {
    slug: 'gifts-for-people-who-have-everything',
    title: 'Funny Gifts for People Who Have Everything',
    h1: 'Funny gifts for people who have everything except this nonsense',
    description: 'Find funny gifts for people who have everything, weird catalog picks, practical gag gifts, and oddball products.',
    intro: 'When someone already owns the sensible options, specificity and absurdity become the advantage.',
    keywords: ['everything', 'hard to shop', 'weird', 'novelty', 'gag', 'odd', 'unique', 'funny'],
  },
  {
    slug: 'funny-gifts-for-men',
    title: 'Funny Gifts for Men',
    h1: 'Funny gifts for men that are better than another multitool',
    description: 'Browse funny gifts for men, dad jokes, practical novelty products, and weird finds for hard-to-shop-for guys.',
    intro: 'The best funny gifts for men are specific enough to feel chosen and useful enough not to vanish into a drawer.',
    keywords: ['men', 'man', 'dad', 'grandpa', 'gadget', 'joke', 'sports', 'grill'],
  },
  {
    slug: 'funny-gifts-for-women',
    title: 'Funny Gifts for Women',
    h1: 'Funny gifts for women that are playful without being lazy',
    description: 'Find funny gifts for women, friend gifts, beauty gag gifts, self-care jokes, and novelty products.',
    intro: 'Funny gifts work best when they match a real interest first and make the joke second.',
    keywords: ['women', 'woman', 'friend', 'beauty', 'makeup', 'self care', 'spa', 'birthday'],
  },
  {
    slug: 'sarcastic-gifts',
    title: 'Sarcastic Gifts',
    h1: 'Sarcastic gifts for people fluent in side-eye',
    description: 'Browse sarcastic gifts, snarky desk finds, funny mugs, and gag products for dry-humor people.',
    intro: 'Sarcastic gifts need a sharp edge but not a mean one. The best ones feel like an inside joke.',
    keywords: ['sarcastic', 'snark', 'snarky', 'joke', 'office', 'mug', 'desk', 'gag'],
  },
  {
    slug: 'funny-cooking-gifts',
    title: 'Funny Cooking Gifts',
    h1: 'Funny cooking gifts for kitchens that already have the basics',
    description: 'Shop funny cooking gifts, weird kitchen tools, novelty food gifts, and practical gadgets.',
    intro: 'Kitchen gifts are strongest when they are actually useful once and funny every time they appear.',
    keywords: ['cooking', 'cook', 'kitchen', 'food', 'gadget', 'mug', 'coffee', 'weird'],
  },
  {
    slug: 'weird-home-decor-gifts',
    title: 'Weird Home Decor Gifts',
    h1: 'Weird home decor gifts for people who do not want another beige thing',
    description: 'Find weird home decor gifts, oddball shelf pieces, funny housewarming gifts, and novelty room finds.',
    intro: 'Weird decor works when it gives a room a story without requiring a full explanation.',
    keywords: ['home-decor', 'decor', 'home', 'housewarming', 'weird', 'candle', 'statue', 'novelty'],
  },
  {
    slug: 'optical-illusion-decor-gifts',
    title: 'Optical Illusion Decor Gifts',
    h1: 'Optical illusion decor gifts for rooms that need a double take',
    description: 'Browse optical illusion decor gifts, weird statues, odd shelf pieces, and conversation-starting home finds.',
    intro: 'Optical illusion decor works when the joke is visual before anyone reads the box. These picks are built for shelves, desks, and rooms that need one strange focal point.',
    keywords: ['optical', 'illusion', 'decor', 'statue', 'home', 'weird', 'shelf', 'novelty'],
  },
  {
    slug: 'funny-gifts-for-teachers',
    title: 'Funny Gifts for Teachers',
    h1: 'Funny gifts for teachers who have earned the joke',
    description: 'Browse funny teacher gifts, classroom-safe gag gifts, desk items, mugs, and practical novelty finds.',
    intro: 'Teacher gifts should be useful, respectful, and funny enough to survive the last week of school.',
    keywords: ['teacher', 'school', 'classroom', 'desk', 'coffee', 'mug', 'office-safe', 'work'],
  },
  {
    slug: 'funny-gifts-for-nurses',
    title: 'Funny Gifts for Nurses',
    h1: 'Funny gifts for nurses with a strong tolerance for chaos',
    description: 'Find funny nurse gifts, work-safe gag gifts, coffee gifts, desk finds, and self-care novelty products.',
    intro: 'Nurse gifts should respect the job and still acknowledge that the shift probably deserves a laugh.',
    keywords: ['nurse', 'healthcare', 'work', 'coffee', 'mug', 'self care', 'office-safe', 'sarcastic'],
  },
  {
    slug: 'funny-book-lover-gifts',
    title: 'Funny Book Lover Gifts',
    h1: 'Funny book lover gifts for readers with shelf control issues',
    description: 'Browse funny book lover gifts, trivia books, coloring books, journals, and bookish gag finds.',
    intro: 'Bookish gifts work when they fit the ritual: reading, collecting, annotating, or avoiding people politely.',
    keywords: ['book', 'bookish', 'reader', 'reading', 'journal', 'coloring', 'trivia', 'coffee'],
  },
  {
    slug: 'funny-sports-fan-gifts',
    title: 'Funny Sports Fan Gifts',
    h1: 'Funny sports fan gifts for people who narrate the game from the couch',
    description: 'Find funny sports fan gifts, soccer finds, game-day gag gifts, and novelty products for competitive people.',
    intro: 'Sports gifts are easiest when they combine team-day usefulness with a joke that lands before kickoff.',
    keywords: ['sports', 'soccer', 'game', 'fan', 'dad', 'party', 'gadget', 'funny'],
  },
  {
    slug: 'funny-wine-gifts',
    title: 'Funny Wine Gifts',
    h1: 'Funny wine gifts for people who bring commentary with the bottle',
    description: 'Browse funny wine gifts, drinkware, kitchen gag gifts, party products, and silly host gifts.',
    intro: 'Wine gifts should either help pour the drink, protect the table, or make the next toast a little less dignified.',
    keywords: ['wine', 'drink', 'party', 'kitchen', 'glass', 'host', 'friend', 'gag'],
  },
  {
    slug: 'funny-bath-gifts',
    title: 'Funny Bath Gifts',
    h1: 'Funny bath gifts for people who deserve dramatic relaxation',
    description: 'Find funny bath gifts, bath bombs, spa gag gifts, self-care novelty products, and weird bathroom finds.',
    intro: 'Bath gifts can be soothing and ridiculous at the same time, which is exactly why they work.',
    keywords: ['bath', 'bath bomb', 'spa', 'self care', 'skincare', 'bathroom', 'candle', 'novelty'],
  },
  {
    slug: 'adult-coloring-book-gifts',
    title: 'Adult Coloring Book Gifts',
    h1: 'Adult coloring book gifts for stress, jokes, and questionable themes',
    description: 'Browse adult coloring book gifts, funny activity books, pet coloring books, holiday coloring books, and weird book finds.',
    intro: 'A coloring book gift is low pressure, easy to wrap, and surprisingly specific when the theme is strange enough.',
    keywords: ['adult-coloring', 'coloring', 'book', 'activity', 'stress', 'holiday', 'pet', 'funny'],
  },
  {
    slug: 'funny-halloween-gifts',
    title: 'Funny Halloween Gifts',
    h1: 'Funny Halloween gifts for spooky people with a sense of humor',
    description: 'Find funny Halloween gifts, spooky novelty products, horror coloring books, and weird seasonal gag gifts.',
    intro: 'Halloween gifts get to be theatrical, strange, and seasonal without apologizing for it.',
    keywords: ['halloween', 'horror', 'spooky', 'holiday', 'weird', 'candy', 'party', 'gag'],
  },
  {
    slug: 'funny-christmas-gifts',
    title: 'Funny Christmas Gifts',
    h1: 'Funny Christmas gifts that do more than fill wrapping paper',
    description: 'Browse funny Christmas gifts, holiday gag gifts, stocking stuffers, and white elephant-ready products.',
    intro: 'Christmas gag gifts work best when they fit the person, the party, or the stocking without needing a long setup.',
    keywords: ['christmas', 'holiday', 'stocking', 'white elephant', 'secret santa', 'party', 'gag', 'funny'],
  },
  {
    slug: 'funny-valentines-gifts',
    title: 'Funny Valentines Gifts',
    h1: 'Funny Valentines gifts for people who prefer jokes with affection',
    description: 'Find funny Valentines gifts, silly couple gifts, candles, self-care finds, and romantic gag products.',
    intro: 'A funny Valentines gift should feel affectionate first and unserious second.',
    keywords: ['valentine', 'valentines', 'couple', 'friendship', 'candle', 'spa', 'beauty', 'gag'],
  },
  {
    slug: 'funny-gifts-for-moms',
    title: 'Funny Gifts for Moms',
    h1: 'Funny gifts for moms who deserve better than another plain candle',
    description: 'Browse funny gifts for moms, mom gag gifts, coffee finds, self-care jokes, and useful novelty products.',
    intro: 'Mom gifts work best when they feel useful, personal, and just ridiculous enough to prove you did not panic-buy the first beige thing.',
    keywords: ['mom', 'mother', 'mama', 'coffee', 'self care', 'spa', 'kitchen', 'women'],
  },
  {
    slug: 'funny-gifts-for-gamers',
    title: 'Funny Gifts for Gamers',
    h1: 'Funny gifts for gamers who already have the serious gear',
    description: 'Find funny gamer gifts, gaming desk finds, controller-adjacent jokes, and novelty products for people who live in side quests.',
    intro: 'Gamer gifts should fit the setup, the desk, or the running joke. The best ones feel like a side quest with free shipping.',
    keywords: ['gamer', 'gaming', 'game', 'controller', 'desk', 'keyboard', 'nerd', 'geek'],
  },
  {
    slug: 'funny-golf-gifts',
    title: 'Funny Golf Gifts',
    h1: 'Funny golf gifts for people who narrate every bad shot',
    description: 'Browse funny golf gifts, golfer gag gifts, dad golf finds, and novelty game-day products from the goose.gifts catalog.',
    intro: 'Golf gifts have permission to be practical, smug, and a little too specific. That is the whole sport.',
    keywords: ['golf', 'golfer', 'club', 'tee', 'sports', 'dad', 'outdoor', 'game'],
  },
  {
    slug: 'funny-gardening-gifts',
    title: 'Funny Gardening Gifts',
    h1: 'Funny gardening gifts for plant people with dirt under control',
    description: 'Shop funny gardening gifts, plant lover finds, yard jokes, and useful novelty products for people who treat seedlings like pets.',
    intro: 'Gardening gifts are strongest when they belong outside, near a windowsill, or in the hands of someone who has opinions about soil.',
    keywords: ['garden', 'gardening', 'plant', 'plants', 'yard', 'outdoor', 'mom', 'dad'],
  },
  {
    slug: 'funny-hostess-gifts',
    title: 'Funny Hostess Gifts',
    h1: 'Funny hostess gifts that do more than replace the wine',
    description: 'Find funny hostess gifts, party host finds, kitchen jokes, wine-adjacent gifts, and housewarming-ready novelty products.',
    intro: 'A good host gift should be easy to hand over, useful after the party, and strange enough to remember who brought it.',
    keywords: ['host', 'hostess', 'party', 'wine', 'kitchen', 'home', 'candle', 'housewarming'],
  },
];

export function getGiftGuide(slug: string): GiftGuideDefinition | undefined {
  return giftGuides.find((guide) => guide.slug === slug);
}

const featuredGiftGuideSlugs = [
  'white-elephant-gifts',
  'funny-gifts-for-coworkers',
  'funny-gifts-for-dads',
  'weird-kitchen-gadgets',
  'novelty-desk-toys',
  'secret-santa-gag-gifts',
  'cat-lover-gag-gifts',
  'dog-lover-gag-gifts',
  'prank-gifts-for-friends',
  'funny-birthday-gag-gifts',
  'funny-coffee-mugs',
  'funny-poop-gifts',
  'funny-gifts-for-dads-who-fish',
  'gifts-for-people-who-have-everything',
  'funny-gifts-for-moms',
  'funny-gifts-for-gamers',
  'funny-golf-gifts',
  'funny-gardening-gifts',
  'funny-hostess-gifts',
];

export function getFeaturedGiftGuides(
  activeSlug?: string,
  limit: number = 12
): GiftGuideDefinition[] {
  const featuredGuides = featuredGiftGuideSlugs
    .map((slug) => getGiftGuide(slug))
    .filter((guide): guide is GiftGuideDefinition => Boolean(guide));

  if (!activeSlug || featuredGuides.some((guide) => guide.slug === activeSlug)) {
    return featuredGuides.slice(0, limit);
  }

  const activeGuide = getGiftGuide(activeSlug);

  return activeGuide
    ? [activeGuide, ...featuredGuides.slice(0, Math.max(0, limit - 1))]
    : featuredGuides.slice(0, limit);
}

function keywordRegex(keyword: string): string {
  const words = keyword.toLowerCase().match(/[a-z0-9]+/g) || [];

  return `(^|[^[:alnum:]])${words.join('[^[:alnum:]]+')}([^[:alnum:]]|$)`;
}

function titleKeywordMatchClause(keyword: string) {
  return sql`${products.title} ~* ${keywordRegex(keyword)}`;
}

function sourceQueryKeywordMatchClause(keyword: string) {
  return sql`COALESCE(${products.sourceQuery}, '') ~* ${keywordRegex(keyword)}`;
}

function generatedKeywordMatchClause(keyword: string) {
  const pattern = keywordRegex(keyword);

  return sql`(
    COALESCE(${products.punnyTitle}, '') ~* ${pattern}
    OR COALESCE(${products.wittyDescription}, '') ~* ${pattern}
    OR array_to_string(COALESCE(${products.humorTags}, ARRAY[]::text[]), ' ') ~* ${pattern}
  )`;
}

function keywordMatchClause(keyword: string) {
  return sql`(
    ${titleKeywordMatchClause(keyword)}
    OR ${sourceQueryKeywordMatchClause(keyword)}
    OR ${generatedKeywordMatchClause(keyword)}
  )`;
}

function titleKeywordGroupMatchClause(keywords: string[]) {
  return sql`(${sql.join(keywords.map(titleKeywordMatchClause), sql` OR `)})`;
}

function focusMatchClause(groups: string[][]) {
  return sql`(${sql.join(groups.map(titleKeywordGroupMatchClause), sql` AND `)})`;
}

function guideMatchScoreSql(guide: GiftGuideDefinition, groups: string[][]) {
  const titleScore = sql.join(
    guide.keywords.map((keyword) => sql`CASE WHEN ${titleKeywordMatchClause(keyword)} THEN 4 ELSE 0 END`),
    sql` + `
  );
  const sourceQueryScore = sql.join(
    guide.keywords.map((keyword) => sql`CASE WHEN ${sourceQueryKeywordMatchClause(keyword)} THEN 2 ELSE 0 END`),
    sql` + `
  );
  const generatedScore = sql.join(
    guide.keywords.map((keyword) => sql`CASE WHEN ${generatedKeywordMatchClause(keyword)} THEN 1 ELSE 0 END`),
    sql` + `
  );
  const focusScore = sql.join(
    groups.map((group) => sql`CASE WHEN ${titleKeywordGroupMatchClause(group)} THEN 10 ELSE 0 END`),
    sql` + `
  );

  return sql`(${titleScore}) + (${sourceQueryScore}) + (${generatedScore}) + (${focusScore})`;
}

async function selectGiftGuideRows(
  guide: GiftGuideDefinition,
  groups: string[][],
  limit: number,
  focusedOnly: boolean
) {
  const keywordClauses = guide.keywords.map(keywordMatchClause);
  const focusClause = focusMatchClause(groups);
  const matchScore = guideMatchScoreSql(guide, groups);
  const relevanceClause = focusedOnly
    ? focusClause
    : sql`(${focusClause} OR ${sql.join(keywordClauses, sql` OR `)})`;

  return db
    .select({
      id: products.id,
      title: products.title,
      punnyTitle: products.punnyTitle,
      wittyDescription: products.wittyDescription,
      humorTags: products.humorTags,
      qualityScore: products.qualityScore,
      sourceQuery: products.sourceQuery,
      isActive: products.isActive,
      price: products.price,
      currency: products.currency,
      imageUrl: products.imageUrl,
      affiliateUrl: products.affiliateUrl,
      source: products.source,
      rating: products.rating,
      reviewCount: products.reviewCount,
      clickCount: products.clickCount,
      impressionCount: products.impressionCount,
    })
    .from(products)
    .where(sql`
      ${products.isActive} = true
      AND ${products.imageUrl} IS NOT NULL
      AND ${products.affiliateUrl} IS NOT NULL
      AND (${products.price} <= 0 OR ${products.price} <= 250)
      AND ${relevanceClause}
    `)
    .orderBy(sql`${matchScore} DESC, ${products.qualityScore} DESC NULLS LAST, ${products.clickCount} DESC, ${products.impressionCount} DESC`)
    .limit(limit);
}

export async function getGiftGuideProducts(
  guide: GiftGuideDefinition,
  limit: number = 36
): Promise<Product[]> {
  const focusGroups = giftGuideFocusKeywordGroups[guide.slug] || [guide.keywords.slice(0, 1)];
  const focusedRows = await selectGiftGuideRows(guide, focusGroups, limit, true);
  const minimumFocusedResults = Math.min(MIN_FOCUSED_GUIDE_PRODUCTS, limit);
  const rows = focusedRows.length >= minimumFocusedResults
    ? focusedRows
    : await selectGiftGuideRows(guide, focusGroups, limit, false);

  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      punnyTitle: row.punnyTitle || undefined,
      wittyDescription: row.wittyDescription || undefined,
      humorTags: row.humorTags || undefined,
      qualityScore: row.qualityScore ? parseFloat(row.qualityScore) : undefined,
      sourceQuery: row.sourceQuery || undefined,
      isActive: row.isActive,
      price: parseFloat(row.price),
      currency: row.currency,
      imageUrl: cleanImageUrl(row.imageUrl || '', row.source),
      affiliateUrl: row.affiliateUrl,
      source: row.source as 'amazon' | 'etsy',
      rating: row.rating ? parseFloat(row.rating) : undefined,
      reviewCount: row.reviewCount || undefined,
      clickCount: row.clickCount || 0,
      impressionCount: row.impressionCount || 0,
    }));
}
