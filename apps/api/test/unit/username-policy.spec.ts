import { UsernamePolicy } from '../../src/modules/users/username-policy';

describe('UsernamePolicy.validateFormat', () => {
  it('accepts a normal lowercase-normalized username', () => {
    expect(UsernamePolicy.validateFormat('Ahmad_92')).toBe('ahmad_92');
  });

  it('rejects usernames shorter than the minimum length', () => {
    expect(() => UsernamePolicy.validateFormat('ab')).toThrow();
  });

  it('rejects usernames longer than the maximum length', () => {
    expect(() => UsernamePolicy.validateFormat('a'.repeat(21))).toThrow();
  });

  it('rejects characters outside a-z0-9_ (blocks Unicode confusables by construction)', () => {
    expect(() => UsernamePolicy.validateFormat('аhmad')).toThrow(); // Cyrillic 'а'
    expect(() => UsernamePolicy.validateFormat('ahmad!')).toThrow();
    expect(() => UsernamePolicy.validateFormat('ah mad')).toThrow();
  });

  it('rejects usernames starting with a digit or underscore', () => {
    expect(() => UsernamePolicy.validateFormat('1ahmad')).toThrow();
    expect(() => UsernamePolicy.validateFormat('_ahmad')).toThrow();
  });

  it('rejects consecutive underscores', () => {
    expect(() => UsernamePolicy.validateFormat('ah__mad')).toThrow();
  });
});
