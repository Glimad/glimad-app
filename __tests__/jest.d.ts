declare global {
  namespace jest {
    interface Mock<T = any, Y extends any[] = any> {
      (...args: Y): unknown;
      mockReturnValueOnce(value: unknown): jest.Mock<T, Y>;
      mockResolvedValueOnce(value: unknown): jest.Mock<T, Y>;
      mockImplementationOnce(fn: (...args: Y) => T): jest.Mock<T, Y>;
      mock(): jest.Mock<T, Y>;
      fn(): jest.Mock<T, Y>;
    }

    function fn(): jest.Mock;
    function mock(moduleName: string): void;
  }
}

export {};
