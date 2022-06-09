import { FLBR } from '@system/config';
import { SYSTEM_NAME } from '@system/constants';
import Modifier from '@system/modifier';
import BRRollHandler from 'src/components/roll/roller';
import { capitalize } from '@utils/string-util';

export default class BladeRunnerItem extends Item {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  get props() {
    return this.data.data;
  }

  get qty() {
    return this.props.qty;
  }

  get isPhysical() {
    return FLBR.physicalItems.includes(this.type);
  }

  get isOffensive() {
    return this.props.damage != null;
  }

  get hasModifier() {
    if (!this.props.modifiers) return false;
    return !foundry.utils.isObjectEmpty(this.props.modifiers);
  }

  get rollable() {
    return !!(this.props.rollable ?? false);
  }

  /** 
   * The name with a quantity in parentheses.
   * @type {string}
   */
  get detailedName() {
    let str = this.name;
    if (this.qty > 1) {
      str += ` (${this.qty})`;
    }
    return str;
  }

  /* ------------------------------------------- */

  static get CHAT_TEMPLATE() {
    const sysName = game.system.data.name || SYSTEM_NAME;
    return `systems/${sysName}/templates/item/item-chatcard.hbs`;
  }

  /* ------------------------------------------- */

  /**
   * Gets an array of modifiers in this item.
   * @param {Object}         [options]           Additional options to filter the returned array of modifiers
   * @param {string|string[]} options.targets    Filters modifiers based on plausible targets
   * @param {boolean}         options.onlyActive Filters modifiers based on their active status
   * @returns {Modifier[]}
   */
  getModifiers(options = {}) {
    const mods = Modifier.getModifiers(this, 'data.data.modifiers', options);
    return mods ?? [];
  }

  /* ------------------------------------------- */
  /*  Event Handlers                             */
  /* ------------------------------------------- */

  // TODO later
  /** @override *
  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);

    // When creating an item in a character.
    if (this.actor && this.actor.type === 'character') {
      // When creating an injury in a character.
      if (this.type === 'injury') {
        // If there is a heal time set.
        let healTime = this.data.data.healTime;
        if (healTime) {
          try {
            const roll = Roll.create(healTime);
            await roll.evaluate({ async: true });
            healTime = roll.terms.reduce((sum, t) => sum + t.values.reduce((tot, v) => tot + v, 0), 0);
            healTime = `${healTime} ${game.i18n.localize(`T2K4E.InjurySheet.day${healTime > 1 ? 's' : ''}`)}`;
            this.update({ 'data.healTime': healTime });
          }
          catch (e) {
            console.warn('t2k4 | Item#_onCreate | Invalid formula for Injury heal time roll.');
          }
        }
      }
    }
  }//*/

  /* ------------------------------------------ */
  /*  Utility Functions                         */
  /* ------------------------------------------ */

  roll() {
    if (!this.rollable) return;
    if (!this.actor) return;
    // this.actor.rollStat(this.props.attribute, this.props.skill);

    const attributeKey = this.props.attribute;
    const skillKey = this.props.skill;
    const attributeName = game.i18n.localize(`FLBR.ATTRIBUTE.${attributeKey.toUpperCase()}`);
    const skillName = skillKey ? game.i18n.localize(`FLBR.SKILL.${capitalize(skillKey)}`) : null;
    const title = `${this.detailedName} (${attributeName}${skillKey ? ` & ${skillName}` : ''})`;
    const attributeValue = this.actor.getAttribute(attributeKey);
    const skillValue = this.actor.getSkill(skillKey);

    const targets = [attributeKey];
    if (skillKey) targets.push(skillKey);

    const dice = [];
    if (attributeValue) dice.push(attributeValue);
    if (skillValue) dice.push(skillValue);

    const roller = new BRRollHandler({
      title,
      actor: this.actor,
      attributeKey, skillKey, dice,
      items: [this],
      modifiers: this.actor.getRollModifiers({ targets }),
      maxPush: FLBR.maxPushMap[this.actor.nature],
    });
    return roller.render(true);
  }

  /* ------------------------------------------ */

  // eslint-disable-next-line max-len
  /** @typedef {import('@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/chatMessageData').ChatMessageDataConstructorData} ChatMessageDataConstructorData */

  /**
   * Transforms an Item into a ChatMessage.
   * This function can either create the ChatMessage directly, or return the data object that will be used to create.
   * @param {ChatMessageDataConstructorData} [messageData]
   *   The data object to use when creating the message
   * @return {Promise.<ChatMessage|ChatMessageData>} A promise which resolves to the created ChatMessage entity
   *   if create is true
   *   or the Object of prepared chatData otherwise.
   * @async
   */
  async toMessage(messageData = {}, { rollMode = null, create = true } = {}) {
    // Renders the template with item data.
    const content = await renderTemplate(this.constructor.CHAT_TEMPLATE, {
      name: this.name,
      img: this.img,
      type: this.type,
      data: this.props,
    });

    // Prepares chat data.
    messageData = foundry.utils.mergeObject({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content,
      sound: CONFIG.sounds.notification,
    }, messageData);

    // Creates the message.
    const cls = getDocumentClass('ChatMessage');
    const msg = new cls(messageData);

    // Sends the messages or returns its data.
    if (create) return cls.create(msg.data, { rollMode });
    if (rollMode) msg.applyRollMode(rollMode);
    return msg.data.toObject();
  }
}