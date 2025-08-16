import crypto from 'crypto';

export const md5 = (content: string) => {
  return crypto.createHash('md5').update(content);
};

export const md5Hex = (content: string) => md5(content).digest('hex'); 