def greet(name):
    print(f"Hello, {name}!")

def main():
    name = input("What is your name? ")
    greet(name)
    numbers = [1, 2, 3, 4, 5]
    for n in numbers:
        print(f"Number: {n}")

if __name__ == "__main__":
    main()
