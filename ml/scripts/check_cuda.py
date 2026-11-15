import torch

print("=" * 50)
print(f"CUDA Available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"Device count:   {torch.cuda.device_count()}")
    print(f"Device name:    {torch.cuda.get_device_name(0)}")
    vram = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    print(f"VRAM:           {vram:.2f} GB")

    # Run a test tensor operation on GPU
    a = torch.randn(1000, 1000, device="cuda")
    b = torch.matmul(a, a)
    print(f"GPU Matmul (1000x1000): SUCCESS! Result shape {b.shape}")
else:
    print("CUDA is NOT available.")
print("=" * 50)
