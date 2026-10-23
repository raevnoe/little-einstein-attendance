import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasPhrase, togglePhrase } from '../src/lib/observationPhrases.js';

describe('observation quick phrases', () => {
  it('adds a phrase as a sentence', () => {
    assert.equal(togglePhrase('', 'Followed instructions'), 'Followed instructions.');
    assert.equal(togglePhrase('Loved the song', 'Followed instructions'), 'Loved the song. Followed instructions.');
    assert.equal(togglePhrase('Loved the song!', 'Showed improvement'), 'Loved the song! Showed improvement.');
  });

  it('removes a phrase that is already there (tap again)', () => {
    assert.equal(togglePhrase('Followed instructions. Needs more practice.', 'Followed instructions'), 'Needs more practice.');
    assert.equal(togglePhrase('Loved the song. Needs more practice.', 'Needs more practice'), 'Loved the song.');
    assert.equal(togglePhrase('Followed instructions.', 'Followed instructions'), '');
  });

  it('recognises phrases without matching inside other words, ignoring case', () => {
    assert.equal(hasPhrase('followed instructions well', 'Followed instructions'), true);
    assert.equal(hasPhrase('Unfollowed instructions', 'Followed instructions'), false);
    assert.equal(hasPhrase('', 'Followed instructions'), false);
  });

  it('never goes past the length limit', () => {
    const long = 'x'.repeat(490);
    assert.equal(togglePhrase(long, 'Followed instructions', 500), long);
  });
});
