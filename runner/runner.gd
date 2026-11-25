extends Node

func _ready() -> void:
	var script := GDScript.new()
	script.resource_path = "res://snippet.gd"
	script.source_code = FileAccess.get_file_as_string("/tmp/snippet.txt")
	if script.reload() != OK:
		push_error("Failed to load snippet!")
		get_tree().quit(2)
		return

	if not ClassDB.is_parent_class(script.get_instance_base_type(), &"Node"):
		push_error("The snippet must extend Node!")
		get_tree().quit(2)
		return

	var snippet = script.new()
	if not is_instance_valid(snippet):
		push_error("Failed to instance script!")
		get_tree().quit(2)
		return

	_run_once.call_deferred(snippet)

func _run_once(snippet: Node) -> void:
	# Quit is handled after this callback returns. Request it first so a
	# snippet calling quit(code) can still override the default exit code.
	get_tree().quit()
	add_child(snippet) # Godot calls _ready() synchronously on entry.
	if is_instance_valid(snippet):
		# Tear down before a _process callback or frame-based await can run.
		snippet.free()
